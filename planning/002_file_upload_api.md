# File Upload APIs

This RFC describes the requirements and definition of the APIs required to allow
users to perform file upload after a failed test run.

## Terminology

File: any file that is uploaded to the server
Failure: a single failure in golden testing
Test Run: a single test run - often, but not always, 1:1 with a commit (but one could re-run the test). Contains 1+ failures

## Requirements

### General Requirements

1. Each "test run" belongs to a project and is associated with some metadata:
    - commit hash
    - project id (likely part of the URL)
    - branch name (assuming git)
    - Other optional metadata could be allowed (e.g. an arbitrary `Map<String, String>` that could be optionally be displayed in the UI for the test run)
2. Each test run may have an arbitrary (>0) number of failures.
3. For each failure, a client MUST provide
    - the path, relative to the codebase root, of the golden file (on first run, the original file may not exist, but we need to know the path of where to put the "changed" file on approval)
    - the binary content of the new (different) file.
4. For each failure, a client MAY provide:
    - the content of the original file itself (to provide a side-by-side view)
    - the path/filename where the new file was saved locally
    - a list of additional files, for example a diff file, an image high contrast version, etc.. each must have:
        - label (required): used in the UI to identify it (e.g. "high contrast", "diff") - we may have "special"
        - file_name (required): path/name.ext
        - content (required): binary content of the file
5. For each file provided, an optional mimetype can be provided for better display in the UI (otherwise it'll be inferred. Any filetype is supported, but better UI will be provided for: "text/\*", "image/png", "image/svg+xml", "image/jpg", "image/webp", "image/gif")
6. Each file will have a (configurable) maximum file size

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
7. Investigate what GCS/S3/other file storage services do

Option 3 seems to be easily discountable, as it provides no benefits over the option 1 aside from ease
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

## TODO: API specification

Pending a decision on the above
