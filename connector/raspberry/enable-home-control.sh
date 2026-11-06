#!/usr/bin/env sh
set -eu

cd "$(dirname "$0")"
test -f .env || { echo "Fehler: .env fehlt. Zuerst ./install.sh ausführen."; exit 1; }
cp .env ".env.backup-$(date +%Y%m%d-%H%M%S)"

set_value() {
  key="$1"
  value="$2"
  if grep -q "^${key}=" .env; then
    sed -i "s|^${key}=.*|${key}=${value}|" .env
  else
    printf '\n%s=%s\n' "$key" "$value" >> .env
  fi
}

set_value HOME_ASSISTANT_CONTROL_ENABLED true
set_value HOME_ASSISTANT_DOMAINS light,media_player,climate,camera,sensor,binary_sensor,weather,calendar,todo,switch,input_boolean,fan,cover,vacuum,humidifier,water_heater,number,input_number,select,input_select,automation,scene,script,person,device_tracker,sun

docker compose up -d --build
echo "AgentOne Home Control ist aktiv. Schlösser, Alarm und Sirenen bleiben blockiert."
