"""Offline checks for explicit repository initialization and publication guards."""

from contextlib import redirect_stderr, redirect_stdout
import importlib.util
from io import StringIO
import os
from pathlib import Path
import unittest
from unittest.mock import Mock, patch


SCRIPT = Path(__file__).resolve().parents[1] / "scripts/deploy_github.py"
SPEC = importlib.util.spec_from_file_location("deploy_github_under_test", SCRIPT)
deploy = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(deploy)


class DeployGuardsTest(unittest.TestCase):
    def metadata(self, **overrides):
        data = {"owner": {"login": "owner"}, "private": False, "default_branch": "main"}
        data.update(overrides)
        return data

    def stub_api(self, empty=False, parents=None, tree=None, branches=None, tags=None):
        api = Mock()
        head = {"object": {"sha": "initial"}}
        replies = []
        if empty:
            replies.extend([deploy.EMPTY_REPOSITORY, {"commit": {"sha": "initial"}}])
        replies.extend([
            head,
            {"parents": [] if parents is None else parents, "tree": {"sha": "initial-tree"}},
            {"tree": [{"path": "README.md", "type": "blob"}] if tree is None else tree},
            [{"name": "main", "commit": {"sha": "initial"}}] if branches is None else branches,
            [] if tags is None else tags,
        ])
        api.request.side_effect = replies
        return api

    def test_empty_repository_gets_readme_bootstrap(self):
        api = self.stub_api(empty=True)
        branch, head = deploy.existing_repository_head(api, "/repos/owner/site", self.metadata(), "owner")
        self.assertEqual(branch, "main")
        self.assertEqual(head["object"]["sha"], "initial")
        mutations = [call for call in api.request.call_args_list if call.args[0] != "GET"]
        self.assertEqual(len(mutations), 1)
        self.assertEqual(mutations[0].args[:2], ("PUT", "/repos/owner/site/contents/README.md"))
        self.assertNotIn("sha", mutations[0].args[2])

    def test_single_initial_readme_is_allowed_without_mutation(self):
        api = self.stub_api()
        deploy.existing_repository_head(api, "/repos/owner/site", self.metadata(), "owner")
        self.assertTrue(all(call.args[0] == "GET" for call in api.request.call_args_list))

    def test_other_owner_or_private_repository_is_rejected_before_requests(self):
        for metadata in (self.metadata(owner={"login": "someone-else"}), self.metadata(private=True)):
            api = Mock()
            with self.subTest(metadata=metadata), self.assertRaises(deploy.DeploymentError):
                deploy.existing_repository_head(api, "/repos/owner/site", metadata, "owner")
            api.request.assert_not_called()

    def test_other_content_or_history_is_rejected_without_mutation(self):
        cases = [
            {"parents": [{"sha": "earlier"}]},
            {"tree": [{"path": "index.html", "type": "blob"}]},
            {"tree": [{"path": "README.md", "type": "blob"}, {"path": "app.py", "type": "blob"}]},
            {"branches": [{"name": "main", "commit": {"sha": "initial"}}, {"name": "work", "commit": {"sha": "other"}}]},
            {"tags": [{"name": "v1"}]},
        ]
        for case in cases:
            with self.subTest(case=case):
                api = self.stub_api(**case)
                with self.assertRaises(deploy.DeploymentError):
                    deploy.existing_repository_head(api, "/repos/owner/site", self.metadata(), "owner")
                self.assertTrue(all(call.args[0] == "GET" for call in api.request.call_args_list))

    def test_normal_publish_refuses_existing_repository(self):
        api = Mock()
        api.request.side_effect = [{"login": "owner"}, self.metadata()]
        with patch.dict(os.environ, {"GH_TOKEN": "fake-test-token"}), patch.object(deploy, "GitHub", return_value=api):
            with self.assertRaises(deploy.DeploymentError):
                deploy.publish("site", [])
        self.assertEqual(api.request.call_count, 2)
        self.assertTrue(all(call.args[0] == "GET" for call in api.request.call_args_list))

    def test_initialize_mode_skips_pages_setup_and_dispatches(self):
        api = Mock()
        replies = [
            {"login": "owner"}, self.metadata(),
            {"object": {"sha": "initial"}},
            {"parents": [], "tree": {"sha": "initial-tree"}},
            {"tree": [{"path": "README.md", "type": "blob"}]},
            [{"name": "main", "commit": {"sha": "initial"}}], [],
            {"sha": "blob"}, {"sha": "tree"}, {"sha": "commit"},
            {}, {"id": 1}, None,
        ]
        api.request.side_effect = replies
        with patch.dict(os.environ, {"GH_TOKEN": "fake-test-token"}), patch.object(deploy, "GitHub", return_value=api), redirect_stdout(StringIO()):
            url = deploy.publish("site", [("README.md", b"project", "100644")], initialize_existing=True)
        self.assertEqual(url, "https://owner.github.io/site/")
        self.assertFalse(any(call.args[1].endswith("/pages") for call in api.request.call_args_list))
        self.assertFalse(any(call.args[1] == "/user/repos" for call in api.request.call_args_list))
        api.request.assert_any_call("POST", "/repos/owner/site/actions/workflows/publish.yml/dispatches", {
            "ref": "main", "inputs": {"force": "false"},
        })
        api.request.assert_any_call("PATCH", "/repos/owner/site/git/refs/heads/main", {
            "sha": "commit", "force": False,
        })

    def test_dry_run_never_reads_token_or_connects(self):
        class NoTokenEnvironment(dict):
            def get(self, key, default=None):
                if key == "GH_TOKEN":
                    raise AssertionError("Dry-run read GH_TOKEN")
                return default

        with patch.object(deploy.os, "environ", NoTokenEnvironment()), patch.object(deploy, "GitHub", side_effect=AssertionError("Network attempted")), redirect_stdout(StringIO()):
            self.assertEqual(deploy.main(["--dry-run"]), 0)

    def test_initialize_flag_requires_publish_and_explicit_name(self):
        for args in (["--initialize-existing", "--repo", "site"], ["--initialize-existing", "--publish"]):
            with self.subTest(args=args), redirect_stderr(StringIO()), self.assertRaises(SystemExit) as caught:
                deploy.main(args)
            self.assertEqual(caught.exception.code, 2)


if __name__ == "__main__":
    unittest.main()
