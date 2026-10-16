# Ochtend.

Een zelfstandige Nederlandse nieuwssite met vijf AI-berichten per dagelijkse editie. De website combineert nieuwskaarten, categorieën, zoeken, een archief en bronverwijzingen met een rustige vormgeving: veel witruimte, grote typografie en zachte oppervlakken. De website en de updater gebruiken geen plug-ins. De frontend heeft geen installatie of buildstap nodig; de updater gebruikt alleen de Python-standaardbibliotheek.

## Huidige status

Het werkproject staat lokaal klaar. **Er is vanuit dit project nog geen website in de cloud gepubliceerd en de dagelijkse cloudtaak is nog niet actief.** De bestaande persoonlijke nieuwstaak is niet via dit project gekoppeld; de selectie wordt bepaald door de meegeleverde briefing en bronnenconfiguratie.

De publicatie is toegestaan, maar het beschikbare GitHub-accounttoken kan geen repositories maken of Pages-instellingen wijzigen. De poging om een repository te maken is met HTTP 403 geweigerd; er is daarbij geen repository aangemaakt. Het token kan wel bestanden, workflows en Actions beheren in een toegankelijke repository. Daarom zijn twee handmatige stappen nodig:

1. Maak op GitHub een **nieuwe openbare repository `ochtendnieuws`** in je eigen account en vink **Add a README file** aan. Voeg geen andere bestanden toe.
2. Open in die repository **Settings → Pages → Build and deployment → Source** en kies **GitHub Actions**.

Daarna kan het project worden geüpload met de expliciete optie `--initialize-existing`. Deze controleert de eigenaar, openbare zichtbaarheid, één eerste commit met alleen `README.md` en de afwezigheid van extra branches of tags. Een geheel lege repository wordt ook ondersteund: het script maakt dan eerst een README-stub. De stub wordt vervangen door de projectinhoud; bestaande projecten worden geweigerd. Alleen `--publish` maakt netwerkverzoeken; standaard toont het script een lokaal publicatieplan.

## Lokaal bekijken

Gebruik Python 3.11 of nieuwer. Open een terminal in deze projectmap:

```bash
python3 -m http.server 3000 --directory public
```

Open vervolgens <http://localhost:3000>. De website leest `public/data/editions.json`. Eerdere edities blijven in dat bestand bewaard. Open `index.html` via de lokale webserver zodat het ophalen van de nieuwsdata werkt.

Voor een losse HTML-preview met ingesloten stijl, code en nieuwsdata:

```bash
python3 scripts/build_preview.py
```

Open daarna `Ochtend-preview.html` rechtstreeks in je browser. Dit is een momentopname voor beoordeling; maak de preview opnieuw om wijzigingen terug te zien. De cloudwebsite gebruikt de bestanden onder `public/`.

## De dagelijkse editie

`config/briefing.json` bepaalt onder meer de naam, het model, het aantal berichten, het tijdstip en de tijdzone. `config/feeds.json` bevat de openbare RSS-bronnen. De meegeleverde selectie richt zich op AI, modellen, agents, toepassingen en onderzoek.

```bash
python3 scripts/update_news.py
```

De updater haalt actuele bronberichten op, selecteert vijf verschillende berichten en schrijft de editie atomair weg. Een tweede run op dezelfde lokale datum voegt geen tweede editie toe. Met `--force` wordt de bestaande editie van die datum vervangen; het archief behoudt één editie per datum.

```bash
python3 scripts/update_news.py --dry-run
python3 scripts/update_news.py --require-morning-window
python3 scripts/update_news.py --force
```

`--dry-run` haalt wel bronnen op en kan een geconfigureerd model aanroepen, maar schrijft de nieuwsdata niet weg. `--require-morning-window` werkt alleen van 08:00 tot 10:00 in `Europe/Amsterdam`. Zonder die optie kan de eerste editie ook overdag handmatig worden gemaakt. `--date YYYY-MM-DD` selecteert een specifieke editiedatum met het ingestelde publicatietijdstip als selectiegrens.

De voorkeur gaat naar berichten uit de laatste 24 uur. Als er te weinig geschikte nieuwe berichten zijn, mag de selectie tot zeven dagen terugkijken; de oorspronkelijke brondatum blijft zichtbaar. De updater filtert eerder gebruikte bron-URL's, identifiers en overeenkomende titels. Het herkennen van dezelfde gebeurtenis bij verschillende bronnen blijft een beste poging; volledige semantische ontdubbeling is niet gegarandeerd. Er worden geen nieuwsfeiten verzonnen om het dagquotum op te vullen. Bij te weinig geschikte berichten of ongeldige uitvoer stopt de updater en blijft de bestaande editie behouden.

Een taalmodel kan internationale bronnen vertalen en Nederlandse samenvattingen en duiding maken. De updater gebruikt, in volgorde van beschikbaarheid, `GH_MODELS_TOKEN`, `OPENAI_API_KEY` of `GITHUB_TOKEN`. GitHub Models gebruikt standaard `openai/gpt-4.1-mini`; bij OpenAI wordt de providerprefix verwijderd. Modelondersteuning, toegangsrechten, quota en beschikbaarheid zijn afhankelijk van het account en worden pas bij een echte run vastgesteld. Met een OpenAI-sleutel kunnen API-kosten ontstaan.

Zonder werkend modeltoken probeert de updater vijf Nederlandstalige bronberichten met korte bronuittreksels te publiceren. Ook bij een modelfout wordt deze bronfallback geprobeerd. Als daarvoor onvoldoende geschikte berichten beschikbaar zijn, stopt de update. Bronlinks en brondata worden gecontroleerd; er is geen menselijke redactie die modelteksten vóór publicatie nakijkt.

## Cloudpublicatie voorbereiden

Deze opdrachten zijn lokaal en gebruiken geen token of netwerk:

```bash
python3 scripts/deploy_github.py
python3 scripts/deploy_github.py --dry-run --repo ochtendnieuws
```

Het plan toont de nieuwe repositorynaam, het aantal projectbestanden en het publicatiegedrag. Alleen projectmappen, README, packageconfiguratie en `.gitignore` worden opgenomen. Caches, lokale omgevingen, `.env`-bestanden, sleutels en symbolische links worden niet geüpload.

Na de twee bovenstaande handmatige stappen kan de daadwerkelijke upload als volgt worden uitgevoerd:

```bash
# Stel GH_TOKEN veilig in via je terminal- of secretmanager.
# Plak het token niet in de opdracht, broncode of repository.
python3 scripts/deploy_github.py --publish --initialize-existing --repo ochtendnieuws
```

Deze uploadmode vereist `--publish` en een expliciete `--repo`. Het script verandert in deze mode geen Pages-instellingen: die moeten handmatig op GitHub Actions staan. Bij meerdere commits, andere bestanden dan een eerste README, extra branches of tags stopt het vóór het vervangen van projectinhoud. Wanneer een gedeeltelijke publicatie mislukt, blijft de repository bestaan voor inspectie. Het script verwijdert die niet en gebruikt nooit een geforceerde branch-update. Na een geslaagde upload voldoet de repository niet langer aan de stubvoorwaarden; een volgende initialisatie wordt geweigerd.

Met een ander token dat daarnaast nieuwe openbare repositories mag maken en GitHub Pages mag configureren, bestaat ook de zelfstandige nieuwe-repositorymode:

```bash
python3 scripts/deploy_github.py --publish --repo een-nieuwe-repositorynaam
```

Zonder `--initialize-existing` wordt iedere bestaande repository geweigerd. Een klassiek persoonlijk toegangstoken heeft voor deze nieuwe-repositorymode doorgaans `public_repo` en `workflow` nodig; account- en organisatiebeleid kunnen aanvullende beperkingen opleggen. Het script bewaart tokens niet.

Het script toont na het starten de Actions-pagina en het verwachte websiteadres. **De site is pas live wanneer de Pages-deployment in Actions geslaagd is.** De publieke repository bevat de projectcode en nieuwsdata; tokenwaarden worden niet meegestuurd als bestand.

## Dagelijkse cloudtaak

De workflow `.github/workflows/publish.yml` voert controles uit, werkt de editie bij, bewaart de nieuwsdata in Git en publiceert de statische website via GitHub Pages. Daarvoor is geen draaiende eigen computer nodig. Bij een fout in de generatie, controles of het opslaan wordt de nieuwe publicatie overgeslagen; de laatst geslaagde Pages-versie blijft online.

Er zijn dagelijks pogingen om 06:00, 07:00 en 08:00 UTC. De updater controleert de Nederlandse tijdzone en slaat een bestaande editie over. Dit vangt zomer- en wintertijd en een mislukte eerste poging op. GitHub Actions kan geplande runs vertragen of overslaan: publicatie is **rond 08:00, zonder garantie op de exacte minuut**. In een openbare repository kunnen geplande workflows na een lange periode zonder activiteit worden uitgeschakeld. Controleer daarom de Actions-pagina regelmatig en schakel de workflow zo nodig opnieuw in.

De workflow kan ook handmatig worden gestart via **Actions → Ochtendnieuws publiceren → Run workflow** op de standaardbranch. Zonder `force` mag een bestaande editie opnieuw worden gepubliceerd; een nieuwe editie wordt alleen gemaakt als die voor vandaag nog ontbreekt. De optionele `force` vervangt de editie van vandaag. Parallelle publicatieruns wachten op elkaar; een onverwachte Git-pushconflict stopt de publicatie in plaats van wijzigingen te overschrijven.

De updatejob vraagt `contents: write` en `models: read`; de deployjob vraagt alleen `pages: write` en `id-token: write`. De ingebouwde `GITHUB_TOKEN` probeert GitHub Models te gebruiken. Als het account daarvoor geen toegang heeft, kan als alternatief `OPENAI_API_KEY` als repositorysecret worden ingesteld. Zonder werkend model kan de Nederlandse bronfallback actief zijn, mits er voldoende geschikte berichten zijn. Controleer de eerste echte run om de beschikbaarheid vast te stellen.

## Controles

```bash
python3 -m unittest discover -s tests -v
node --check public/app.js
python3 -m py_compile scripts/update_news.py scripts/deploy_github.py
```

De tests gebruiken lokale bronvoorbeelden en mocks; zij bewijzen geen beschikbaarheid van RSS-bronnen, modeltoegang of hosting. Daarvoor moet na toestemming een echte publicatierun worden gecontroleerd. Zowel de dagelijkse update als de website blijven onafhankelijk van ChatGPT-plug-ins.
