# slack-bouncer-functions

## Deploying

```sh
# Setup your environment variables.
cat > .env.yml <<EOF
TOKEN_SECRET: "<TOKEN SECRET>"
PUBSUB_TOPIC: "<PUBSUB TOPIC>"
EOF

# Deploy the function.
gcloud functions deploy slackTalkInjestComment --runtime nodejs14 --trigger-http --allow-unauthenticated --env-vars-file=.env.yml --source .
```
