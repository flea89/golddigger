# File Upload APIs

This RFC describes the requirements and definition of the APIs required to allow
users to perform file upload after a failed test run.

## Terminology

-   File: any file that is uploaded to the server
-   Golden Failure: a single assertion failing within a golden test. For each individual golden failure exactly 1 file will be updated if the change is approved.
-   Test Run: a single test run - often, but not always, 1:1 with a commit (but one could re-run the test). Contains 1+ failures

## Requirements

### General Requirements

1. Each "test run" belongs to a project and is associated with some metadata:
    - commit hash
    - project id (likely part of the URL)
    - branch name (assuming git)
    - Other optional metadata could be allowed (e.g. an arbitrary `Map<String, String>` that could be optionally be displayed in the UI for the test run)
2. Each test run may have an arbitrary (>0) number of failures.
3. For each golden failure, a client MUST provide
    - the path, relative to the codebase root, of the golden file (on first run, the original file may not exist, but we need to know the path of where to put the "changed" file on approval) - for example `test/golden/homepage/homepage_mobile.png`
    - the binary content of the new (different) file.
4. For each golden failure, a client MAY provide:
    - the content of the original file itself (to provide a side-by-side view)
    - the path/filename, relative to the codebase root, of the new file (e.g. `tests/golden/failures/homepage_mobile.png`)
    - the name of the test and/or test suite where the failure happened
    - a list of additional files, for example a diff file, an image high contrast version, etc.. each must have:
        - label (required): used in the UI to identify it (e.g. "high contrast", "diff") - we may have "special"
        - file_name (required): path/name.ext
        - content (required): binary content of the file
5. For each file provided, an optional mimetype can be provided for better display in the UI (otherwise it'll be inferred. Any filetype is supported, but better UI will be provided for: "text/\*", "image/png", "image/svg+xml", "image/jpg", "image/webp", "image/gif")
6. Each file will uploaded will be subject to a (configurable) maximum file size

### API format

There are a few options we might consider:

1. Single REST endpoint with `multipart/form-data` content type, all files and metadata in a single request
2. Single REST endpoint with `application/json` content type, files encoded as base64
3. Multiple REST endpoints:
    - POST `/api/v1/projects/<project_id>/` with `application/json` content type to create a test run.
    - (optional) POST `/api/v1/projects/<project_id>/<test_run_id>/failures/` add a failure to the test run.
    - POST `/api/v1/projects/<project_id>/test_runs/<test_run_id>/files/` with `multipart/form-data`, containing file bytes and metadata
4. gRPC service, single rpc with client streaming (first message is metadata, then binary chunks follow)
5. gRPC service, multiple rpcs:
    ```protobuf
    service Uploader {
        rpc CreateTestRun(TestRunMeta) returns (CreateTestRunResponse);
        (optional) rpc CreateFailure(FailureMetadata) returns (CreateFailureResponse);
        rpc UploadFile(File) returns (UploadFileResponse);
    }
    ```
6. Non-http communication (e.g. sftp/rsync)?

Option 2 seems to be easily discountable, as it provides no benefits over the option 1 aside from ease
of parsing/encoding (marginal, multipart should be well supported) and significant file-size
increase

Of the other REST options (1 and 3), the single multipart request is superior for performance
when the connection is stable: everything can be streamed over a single connection
The multiple requests option requires more round trips (and, if not careful, multiple http connections),
but it significantly improves performance in case of failure, as only the failed operations
need retrying.

For the gRPC options similar considerations can be made, although connection reuse is built-in.

Between gRPC and REST, I _think_ gRPC would make it easier to implement resumable uploads
as well as adding gzip compression on upload, but neither would be infeasible

I've briefly investigated what GCS does and, unsurprisingly, it provides both an HTTP and gRPC API
but (this time, surprisingly) the gRPC one has been made public only very recently (late 2024),
while previously all the SDKs were using HTTP. Reading the API spec for GCS, these are my initial thoughs:

1. Resumable uploads are somewhat convoluted regardless of transport - the do seem a bit less
   fiddly in gRPC, possibly because everything is slightly more fiddly in gRPC to begin with
2. In general I think the [WriteObject](https://github.com/googleapis/googleapis/blob/8cf16d3bc5b25568787925cdc56b5f6951863b00/google/storage/v2/storage.proto#L381)
   and [BidiWriteObject](https://github.com/googleapis/googleapis/blob/8cf16d3bc5b25568787925cdc56b5f6951863b00/google/storage/v2/storage.proto#L398) are quite
   useful starting point to consider if we go the gRPC route

## TODO: API specification

Pending a decision on the above
