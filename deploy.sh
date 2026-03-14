#!/bin/bash
# deploy.sh — deploys bisco-bot to EC2
# Usage: ./deploy.sh

set -e

EC2_HOST="18.191.104.85"
EC2_USER="ec2-user"
PEM_KEY="/c/vwhitey/bisco-bot-key.pem"
REMOTE_DIR="/home/ec2-user/bisco-bot"

echo "==> Deploying bisco-bot to EC2..."

# Copy .env to server (always sync it in case secrets changed)
if [ -f .env ]; then
  echo "==> Syncing .env..."
  scp -i "$PEM_KEY" -o StrictHostKeyChecking=no .env "$EC2_USER@$EC2_HOST:$REMOTE_DIR/.env"
else
  echo "==> No local .env found, skipping sync"
fi

# SSH in and run deploy steps
ssh -i "$PEM_KEY" -o StrictHostKeyChecking=no "$EC2_USER@$EC2_HOST" << 'ENDSSH'
  set -e
  cd /home/ec2-user/bisco-bot

  echo "==> Pulling latest code..."
  OLD_PKG=$(md5sum package.json 2>/dev/null | awk '{print $1}')
  git pull origin main
  NEW_PKG=$(md5sum package.json 2>/dev/null | awk '{print $1}')

  if [ "$OLD_PKG" != "$NEW_PKG" ]; then
    echo "==> package.json changed — running npm install..."
    npm install --production
  else
    echo "==> package.json unchanged — skipping npm install"
  fi

  echo "==> Restarting bot with updated env..."
  pm2 restart bisco-bot --update-env || pm2 start src/index.js --name bisco-bot

  echo "==> Saving pm2 process list..."
  pm2 save

  echo "==> Bot status:"
  pm2 status

  echo "==> Done!"
ENDSSH
