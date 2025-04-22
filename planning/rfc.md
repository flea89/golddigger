# Golddigger RFC

This is a first attempt to define and get initial feedback on Golddigger.

# Summary

Goldigger is a product meant to help streamlining Golden Testing workflow, especially when it comes CI/CD. But more in general
unify the workflow for teams.
The goal is to be able to easily run tests, review and approve them throw a easy-to-use web intergace.

# Problem it solved

- There are unfortunately still subtle differences between generated golden images on different host platforms, Golddigger allows to run tests on a single platform (on CI/CD pipelins) removing this problem
- Approval and re-submission of golden test can be lengthy, Goldigger unifies the process in one place

# Goal

Goal of Goldigger:

- Resolve problems stated above
- Should be easy to be self hosted and run on major paas (GCP, AWS and Azure)

# Proposed Solution (MVP)

The first MVP should be as encapsulated as possible should allow to

- Allow for easy integration from major CI/CD tools. To start with Gitlab and Github
- A webservice exposes a deeplink that allows to
  - Get a list of broken golden and their images: pre, post and changes
  - Approve changes. In practice commit new golden test assets.
- Allow

## Not in MVP

- Multi-Project support (one instance per project)
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
Having something like Postgres seems like the most obvious solution, given most paas seem to support it.

- Isn't much more expensive that other solutions like datastore on gcp?

## Logging

Something like Sentry could be a good solution and easy to integrate

## Async tasks

A Redis Queue on a dockerize worker can be deployed anywhere.

# Authentication

TBD

## CI/CD

We need to define what we expose to various CI/CD

I haven't looked yet into it, but probably

- Github action
- Gitlab template.

# Questions

- is it worth using something like terraform to define and manage infrastructure?
