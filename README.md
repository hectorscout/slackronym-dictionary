# slackronym-dictionary
API for `/rad` slack commands


# dev environment

environment variables:

PORT (optional, default: 8080)
SLACKRONYM_DB_URL (mongodb://<dbuser>:<dbpassword>@<something>.mlab.com:<someport>/db-name Get this from mlab or wherever. @ -> %40)
SLACKRONYM_DB_NAME (slackronym-dictionary-dev)
SLACKRONYM_TOKEN (`OAuth Access Token` under `OAuth & Permissions` in `api.slack.com`)
SLACKRONYM_ADMIN_CHANNEL_ID (The channel id of the private channel you want to use for admin stuff. Not needed to initially run Slackronym, then run `/<slackronymcommand> channelid` in your private channel to get this.)

`npm run dev`

ngrok:

setup ngrok
`./ngrok http 8080` from wherever ngrok is...

If ngrok url is `https://24392a0c.ngrok.io`
Put `https://24392a0c.ngrok.io/lookup` into the slash command's `Request URL` (you'll have to edit the command).
Put `https://24392a0c.ngrok.io/request` into the `Request URL` under `Interactive Components`.
