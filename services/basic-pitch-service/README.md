# Service de transcription MIDI

Le service utilise Basic Pitch pour extraire les notes d’un enregistrement et produire un fichier MIDI. Il écoute sur le port `8001`, configuré dans `apps/backend/env.config`.

Depuis la racine du dépôt, construire puis démarrer le service avec Docker :

```powershell
docker build -t pocketgroove-basic-pitch services/basic-pitch-service
docker run -d --name pocketgroove-basic-pitch --restart unless-stopped -p 8001:8001 -v pocketgroove-basic-pitch-data:/tmp pocketgroove-basic-pitch
```

Vérifier qu’il répond :

```powershell
Invoke-RestMethod http://127.0.0.1:8001/docs
```

Le backend appelle le service localement, récupère le MIDI, puis l’enregistre à côté du fichier source dans `apps/backend/uploads`. L’API le fournit ensuite à l’application via `GET /tracks/:id/midi`.
