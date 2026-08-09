# Dockerfile pour campus-edu-backend
FROM node:20-slim

# Répertoire de travail dans le conteneur
WORKDIR /usr/src/app

# Copier les fichiers de dépendances et installer
COPY package.json package-lock.json ./
RUN npm install --production

# Copier le reste du code de l'application
COPY . .

# Créer le répertoire uploads si nécessaire
RUN mkdir -p /usr/src/app/uploads

# Exposer le port de l'application
EXPOSE 3000

# Commande de démarrage
CMD ["npm", "start"]
