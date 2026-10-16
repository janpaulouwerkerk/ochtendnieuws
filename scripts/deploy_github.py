#!/usr/bin/env python3
"""Plan een publicatie, of maak expliciet een nieuwe openbare GitHub Pages-site.

Zonder --publish zijn er geen netwerkverzoeken en wordt GH_TOKEN niet gelezen.
Een bestaande repository wordt alleen met --initialize-existing geïnitialiseerd,
na controle dat deze openbaar en leeg is of alleen één eerste README-commit bevat.
"""

from __future__ import annotations

import argparse
import base64
import json
import os
from pathlib import Path
import re
import sys
import time
from urllib.error import HTTPError, URLError
from urllib.parse import quote
from urllib.request import HTTPRedirectHandler, Request, build_opener


API_URL = "https://api.github.com"
PROJECT_ROOT = Path(__file__).resolve().parents[1]
ROOT_FILES = {"README.md", ".gitignore", "package.json"}
PROJECT_DIRECTORIES = {".github", "public", "scripts", "tests", "config"}
EXCLUDED_DIRECTORIES = {
    ".git", ".cache", ".venv", "venv", "node_modules", "__pycache__",
    "screenshots", "test-results", "playwright-report", "coverage",
}
MAX_FILE_BYTES = 10 * 1024 * 1024
MAX_TOTAL_BYTES = 25 * 1024 * 1024
EMPTY_REPOSITORY = object()


class DeploymentError(RuntimeError):
    """Een beknopte fout zonder toegangsgegevens."""


class NoRedirects(HTTPRedirectHandler):
    """Stuur het autorisatieheader nooit door naar een ander adres."""

    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


class GitHub:
    def __init__(self, token: str):
        self._token = token
        self._opener = build_opener(NoRedirects())

    def request(self, method: str, path: str, payload=None, allow_missing=False, allow_empty=False):
        if not path.startswith("/") or path.startswith("//"):
            raise DeploymentError("Ongeldig GitHub API-pad.")
        body = None if payload is None else json.dumps(payload).encode("utf-8")
        request = Request(
            API_URL + path,
            data=body,
            method=method,
            headers={
                "Authorization": "Bearer " + self._token,
                "Accept": "application/vnd.github+json",
                "Content-Type": "application/json",
                "X-GitHub-Api-Version": "2022-11-28",
                "User-Agent": "ochtendnieuws-deploy",
            },
        )
        try:
            with self._opener.open(request, timeout=30) as response:
                raw = response.read()
                return json.loads(raw) if raw else None
        except HTTPError as exc:
            if allow_missing and exc.code == 404:
                return None
            if allow_empty and exc.code == 409:
                try:
                    message = json.loads(exc.read()).get("message", "")
                except (json.JSONDecodeError, AttributeError):
                    message = ""
                if "git repository is empty" in str(message).lower():
                    return EMPTY_REPOSITORY
            # Geen responsebody loggen: deze kan accountinformatie bevatten.
            raise DeploymentError(
                f"GitHub weigerde {method} {path} (HTTP {exc.code})."
            ) from None
        except (URLError, TimeoutError, json.JSONDecodeError):
            raise DeploymentError("GitHub is niet bereikbaar of gaf een ongeldig antwoord.") from None


def project_files(root: Path) -> list[tuple[str, bytes, str]]:
    """Neem alleen projectonderdelen op; geen caches, symlinks of secrets."""
    files = []
    for path in sorted(root.rglob("*")):
        relative = path.relative_to(root)
        parts = relative.parts
        if any(part in EXCLUDED_DIRECTORIES for part in parts):
            continue
        if parts[0] not in PROJECT_DIRECTORIES and str(relative) not in ROOT_FILES:
            continue
        if any(part.startswith(".env") for part in parts):
            continue
        if path.is_symlink():
            raise DeploymentError(f"Symbolische link geweigerd: {relative.as_posix()}")
        if not path.is_file():
            continue
        if path.suffix in {".pyc", ".pyo", ".log", ".zip", ".pem", ".key"}:
            continue
        if path.stat().st_size > MAX_FILE_BYTES:
            raise DeploymentError(f"Bestand is groter dan 10 MB: {relative.as_posix()}")
        content = path.read_bytes()
        mode = "100755" if os.access(path, os.X_OK) else "100644"
        files.append((relative.as_posix(), content, mode))
    required = {
        "public/index.html", "public/app.js", "scripts/update_news.py",
        ".github/workflows/publish.yml",
    }
    missing = required - {name for name, _, _ in files}
    if missing:
        raise DeploymentError("Project is onvolledig: " + ", ".join(sorted(missing)))
    if sum(len(data) for _, data, _ in files) > MAX_TOTAL_BYTES:
        raise DeploymentError("Het project is groter dan de uploadlimiet van 25 MB.")
    return files


def print_plan(repo: str, files: list[tuple[str, bytes, str]]) -> None:
    print("Plan — er wordt nu niets gepubliceerd en er wordt geen token gebruikt.")
    print(f"Nieuwe OPENBARE repository: <ingelogde-gebruiker>/{repo}")
    print(f"Upload: {len(files)} projectbestanden ({sum(len(data) for _, data, _ in files):,} bytes).")
    print("Een bestaande repository wordt altijd geweigerd.")
    print("GitHub Pages gebruikt de meegeleverde workflow; de eerste run start meteen.")
    print("Vervolgens: dagelijks rond 08:00 Europe/Amsterdam, met herhaalpogingen.")
    print("Uitvoeren na toestemming: GH_TOKEN via de omgeving instellen en --publish toevoegen.")
    print("Het token wordt uitsluitend als HTTP-header verzonden; nooit opgeslagen.")


def existing_repository_head(api: GitHub, repo_path: str, metadata: dict, login: str):
    """Controleer een expliciet gekozen lege repository of eerste README-stub."""
    owner = metadata.get("owner", {}).get("login", "")
    if not isinstance(owner, str) or owner.lower() != login.lower():
        raise DeploymentError("De bestaande repository moet van het ingelogde account zijn.")
    if metadata.get("private") is not False:
        raise DeploymentError("De bestaande repository moet openbaar zijn.")
    if metadata.get("fork") or metadata.get("archived") or metadata.get("disabled"):
        raise DeploymentError("Een fork, gearchiveerde of uitgeschakelde repository wordt geweigerd.")
    branch = metadata.get("default_branch")
    if not isinstance(branch, str) or not branch:
        raise DeploymentError("De standaardbranch kon niet worden vastgesteld.")
    head_path = repo_path + "/git/ref/heads/" + quote(branch, safe="")
    head = api.request("GET", head_path, allow_empty=True)
    if head is EMPTY_REPOSITORY:
        # Zonder sha kan dit nooit een inmiddels bestaand README overschrijven.
        api.request("PUT", repo_path + "/contents/README.md", {
            "message": "Initialiseer lege Ochtend-repository",
            "content": base64.b64encode(b"# Ochtend.\n").decode("ascii"),
        })
        head = api.request("GET", head_path)

    sha = head["object"]["sha"]
    commit = api.request("GET", repo_path + "/git/commits/" + quote(sha, safe=""))
    if commit.get("parents") != []:
        raise DeploymentError("De bestaande repository heeft eerdere commits; er wordt niets vervangen.")
    tree = api.request("GET", repo_path + "/git/trees/" + quote(commit["tree"]["sha"], safe=""))
    entries = tree.get("tree", [])
    if (tree.get("truncated") or len(entries) != 1 or entries[0].get("path") != "README.md"
            or entries[0].get("type") != "blob"):
        raise DeploymentError("Alleen een lege repository of één eerste README.md-stub is toegestaan.")
    branches = api.request("GET", repo_path + "/branches?per_page=100")
    tags = api.request("GET", repo_path + "/tags?per_page=100")
    if (not isinstance(branches, list) or len(branches) != 1 or branches[0].get("name") != branch
            or branches[0].get("commit", {}).get("sha") != sha or tags != []):
        raise DeploymentError("Extra branches of tags gevonden; er wordt niets vervangen.")
    return branch, head


def publish(repo: str, files: list[tuple[str, bytes, str]], initialize_existing=False) -> str:
    # Deze variabele wordt alleen gelezen na de expliciete --publish-optie.
    token = os.environ.get("GH_TOKEN", "").strip()
    if not token:
        raise DeploymentError("--publish vereist GH_TOKEN in de procesomgeving.")
    if not re.fullmatch(r"[A-Za-z0-9_.-]+", token):
        raise DeploymentError("GH_TOKEN bevat ongeldige tekens; de waarde wordt niet getoond.")
    api = GitHub(token)
    account = api.request("GET", "/user")
    login = account.get("login") if isinstance(account, dict) else None
    if not isinstance(login, str) or not re.fullmatch(r"[A-Za-z0-9-]+", login):
        raise DeploymentError("Het ingelogde GitHub-account kon niet worden vastgesteld.")
    repo_path = "/repos/" + quote(login, safe="") + "/" + quote(repo, safe="")
    existing = api.request("GET", repo_path, allow_missing=True)
    if existing is not None and not initialize_existing:
        raise DeploymentError(f"Repository {login}/{repo} bestaat al; er is niets gewijzigd.")
    if initialize_existing:
        if existing is None:
            raise DeploymentError("--initialize-existing vereist een bestaande openbare repository.")
        initial_branch, initial_head = existing_repository_head(api, repo_path, existing, login)
        print(f"Lege repository of eerste README-stub gecontroleerd: {login}/{repo}", flush=True)
        print("De eerste README wordt vervangen door het werkproject.", flush=True)
    else:
        print(f"Nieuwe OPENBARE repository maken: {login}/{repo}", flush=True)
        created = api.request("POST", "/user/repos", {
            "name": repo,
            "description": "Dagelijkse Nederlandse nieuwseditie — vijf berichten, elke ochtend.",
            "private": False,
            # Git Database API's vereisen een bestaande eerste commit.
            "auto_init": True,
            "has_issues": False,
            "has_projects": False,
            "has_wiki": False,
        })
        initial_branch = created.get("default_branch", "main")
        initial_head = None
        print("Repository aangemaakt. Upload van het werkproject gestart.", flush=True)
    try:
        head_path = repo_path + "/git/ref/heads/" + quote(initial_branch, safe="")
        if initial_head is None:
            for attempt in range(10):
                initial_head = api.request("GET", head_path, allow_missing=True)
                if initial_head is not None:
                    break
                if attempt == 9:
                    raise DeploymentError("GitHub heeft de eerste commit nog niet beschikbaar gemaakt.")
                time.sleep(3)
        entries = []
        for name, content, mode in files:
            blob = api.request("POST", repo_path + "/git/blobs", {
                "content": base64.b64encode(content).decode("ascii"),
                "encoding": "base64",
            })
            entries.append({"path": name, "mode": mode, "type": "blob", "sha": blob["sha"]})
        tree = api.request("POST", repo_path + "/git/trees", {"tree": entries})
        commit = api.request("POST", repo_path + "/git/commits", {
            "message": "Publiceer Ochtendnieuws met dagelijkse cloudworkflow",
            "tree": tree["sha"],
            "parents": [initial_head["object"]["sha"]],
        })
        api.request("PATCH", repo_path + "/git/refs/heads/" + quote(initial_branch, safe=""), {
            "sha": commit["sha"], "force": False,
        })
        if initialize_existing:
            print("Pages-instellingen worden niet aangepast. Stel handmatig Settings → Pages → Source → GitHub Actions in.")
        else:
            api.request("POST", repo_path + "/pages", {"build_type": "workflow"})
        # Het kan even duren voordat Actions een nieuw workflowbestand herkent.
        workflow_path = repo_path + "/actions/workflows/publish.yml"
        for attempt in range(10):
            if api.request("GET", workflow_path, allow_missing=True) is not None:
                break
            if attempt == 9:
                raise DeploymentError("Actions herkent de workflow nog niet; start deze handmatig in GitHub.")
            time.sleep(3)
        api.request("POST", workflow_path + "/dispatches", {
            "ref": initial_branch, "inputs": {"force": "false"},
        })
    except (DeploymentError, KeyError, TypeError) as exc:
        print(f"De repository blijft beschikbaar: https://github.com/{login}/{repo}", file=sys.stderr)
        print("De upload of publicatie is niet voltooid. Er worden geen repositories verwijderd en branches worden niet geforceerd overschreven.", file=sys.stderr)
        if isinstance(exc, DeploymentError):
            raise
        raise DeploymentError("GitHub gaf een onverwacht antwoord tijdens de nieuwe publicatie.") from None

    print(f"Workflow gestart: https://github.com/{login}/{repo}/actions")
    suffix = "" if repo.lower() == (login + ".github.io").lower() else quote(repo, safe="") + "/"
    return f"https://{login.lower()}.github.io/{suffix}"


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo", help="Naam van de openbare repository (standaard: ochtendnieuws)")
    parser.add_argument("--initialize-existing", action="store_true",
                        help="Met --publish: initialiseer expliciet een eigen lege openbare repo of eerste README-stub")
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--dry-run", action="store_true", help="Toon het plan, zonder token of netwerk (standaard)")
    mode.add_argument("--publish", action="store_true", help="Maak een nieuwe OPENBARE repository en publiceer")
    args = parser.parse_args(argv)
    if args.initialize_existing and (not args.publish or args.repo is None):
        parser.error("--initialize-existing vereist --publish en een expliciete --repo.")
    args.repo = args.repo or "ochtendnieuws"
    if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._-]{0,99}", args.repo):
        parser.error("Gebruik 1–100 letters, cijfers, punten, streepjes of underscores voor --repo.")
    try:
        files = project_files(PROJECT_ROOT)
        if not args.publish:
            print_plan(args.repo, files)
            return 0
        url = publish(args.repo, files, initialize_existing=args.initialize_existing)
        print(f"Verwacht websiteadres na een geslaagde workflow: {url}")
        print("Controleer de workflow voordat je de website als live beschouwt.")
        return 0
    except (DeploymentError, OSError) as exc:
        print(f"Publicatie gestopt: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
