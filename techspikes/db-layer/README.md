# What I've tried so far
- I managed to connect the app to Firestore and Firestore emulator using Firestore admin SDK

- Setup a Firestore in mongodb mode
    - Failed to connect from Prisma

- Done a bit of research and it seems like Prisma woulnd't be able to connect neither to Firestore nor DocumentDB ( haven't tried super hard :P)
  But from some issues I could infer it's not something that is supported
  - https://github.com/prisma/prisma/issues/13205
  - https://github.com/prisma/prisma/issues/14477



## Learnings

- The suggested connection string you get from the documentation needs to be updated, specifically removing `authMechanismProperties`.
- With the previous step done, connection works... `npx prisma db push` doesn't fail.

- Since we're using Prisma, in theory we should make the DB configurable, and allow to connect to any supported one, ie Postgres.

# Mongo db Atlas

## Learnings

- Cluster and DB stuff is handled through https://cloud.mongodb.com/. We need to understand if that can be a pain point for user mgmt and access. cloud.monbodb has federated mgmt that might easy thing off.
- Prisma doing things at build time on GCP causes problems (tries do connect to the DB from builder) which doesn't seem to work. Needs looking into.
  Probably best to build locally and upload.
- MongoDB blocks acccess by IP. You need to configure whitelisting in mongodb dashboard
- You need replicas to be set, it's required to run transactions.


## Run locally

`cd docker`
`docker compose up -d`
`npm run dev`

## Deploy to cloud run

### Setup

- Create atlas Mongo db
- Run `prisma db push`
- Set DATABASE_URL in cloud run to point to Mongodb Atlas

```
gcloud builds submit \
  --pack image=europe-west12-docker.pkg.dev/golddigger-tec/cloud-run-source-deploy \
  --build-env-vars g="mongodb://localhost:27017/devdb"
```

europe-west12-docker.pkg.dev/golddigger-tec/cloud-run-source-deploy

`gcloud run deploy db-layer --source . --build-env-vars-file .env.prod.yaml --project golddigger-tec --region europe-west12 --env-vars-file .env.prod.yaml`
