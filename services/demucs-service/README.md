# Service Demucs local

Le backend NestJS délègue la séparation des pistes à ce service sur le port `8000`. Il doit rester démarré pendant l’utilisation de la séparation.

Depuis la racine du dépôt, installe les dépendances Python une fois :

```powershell
python -m pip install -r services/demucs-service/requirements.txt
```

Puis démarre le service dans un terminal dédié :

```powershell
Set-Location services/demucs-service
python -m uvicorn app.main:app --host 0.0.0.0 --port 8000
```

Laisse ce terminal ouvert. `http://127.0.0.1:8000/docs` doit afficher la documentation du service. Le premier traitement peut télécharger les poids du modèle Demucs et prendre plus longtemps ; les traitements suivants réutilisent normalement le cache local.
