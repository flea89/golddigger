# Golddigger RFC

This is a first attempt to define and get initial feedback on Golddigger.

# Summary

Goldigger is a product meant to help streamlining Golden Testing workflow, especially when it comes CI/CD. But more in general
unify the workflow for teams.
The goal is to be able to easily run tests, review and approve them throw a easy-to-use web intergace.

# Problem it solves

- There are unfortunately still subtle differences between generated golden images on different host platforms, Golddigger allows to run tests on a single platform (on CI/CD pipelins) removing this problem
- Approval and re-submission of golden test can be lengthy, Goldigger unifies the process in one place

# Goal

Goal of Goldigger:

- Resolve problems stated above
- Should be easy to be self hosted on premis ( or on your raspeberry pi in your cupboard :) )
- Should be easy to deploy to GCP, AWS, Azure and Vercel.


# Proposed Solution (MVP)

The first MVP should be as encapsulated as possible should allow to

- Allow for easy integration from major CI/CD tools. To start with Gitlab and Github
- A webservice exposes a deeplink that allows to
  - Get a list of broken golden and their images: pre, post and changes
  - Approve changes. In practice commit new golden test assets.
- While multi-project isn't necessarely in MVP, we should keep that in mind when architecturing the app

## Flow

- Pipeline runs golden tests with tooling of choice (language/framework dependant)
- On success, do nothing
- On failure, code in the pipeline uploads, as a single HTTP request, the images before and after + some git metadata (e.g. commit hash, PR/MR id, branch name, ....)
- The services replies with a URL which, when visited, provides users with a UI that allows them to
  - Reject the change (confirm the failure - e.g. we actually introduced a regression, we should fix our code, not the golden) -> this is prob not essential, but feels like it'd be nice to have - could be used to prune old data, etc...
  - Accept the change (we made a change that changed the UI as it should have, golden needs updating)
- If the change is accepted, then some TBD mechanism allows users to update goldens in the repo, ideally in the same branch/MR as the original trigger
- Once the change is applied (e.g. upstream has the new goldens) we should let the service know, so it can mark the change as applied and potentially do some clean up

## To consider

- Some some kind of cli tool could be useful to simplify some of these tasks (e.g. CI -> Golddigger and Dev Laptop -> Golddigger)
- terraform to define and manage infrastructure


## Not in MVP

- Multi-Project support and UI (start with only one instance per project but architecture the app to allow for more).

- Project mgmt like
  - Beeing able to see previous runs

# Technical challenges

How do we get multi-cloud support?

## Webframework

Web frameworks in general shouldn't be a challenge. Any major one should work fine. ie Django Next.
My current preference would currently be NextJS to allow a mix of server side and client side rendering.

## Storage

Use cloud solutions like Google Cloud storage and S3, with a custom layer of abstraction should be fine.

## Database

I don't have lot of experience having to run the same service on multiple Paas.
Postgres seems like the a plausible solution, given most paas seem to support it. But I wonder if it is much more expensive that other non-sql solutions.

Another option is Mongo DB. . Firestore now supports (a subset of) mongodb APIs, and aws has documentdb. Pricing for those is in general quite cheap, so that's great.
I'm not sureFirestore/documentdb would support an ORM like prisma (the partial support of mongo APIs might break things?)
An alternative could be MongoDb Atlas.
This needs lots of thinking, a small techspike and it's own design doc.



## Logging

Something like Sentry could be a good solution and easy to integrate

## Async tasks

!Probably non needed for MVP, just added to start thinking about it.

A Redis Queue on a dockerize worker can be deployed anywhere.

# Authentication

TBD

## CI/CD

We need to define what we expose to various CI/CD

I haven't looked yet into it, but probably

- Github action
- Gitlab template.
