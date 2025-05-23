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
    - POST `/api/v1/projects/<project_id>/test_runs` with `application/json` content type to create a test run.
    - (optional) POST `/api/v1/projects/<project_id>/test_runs/<test_run_id>/failures/` add a failure to the test run.
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

One more points to add to the REST vs gRPC comparison - AFAICT, at least with the node grpc
library, you can't share the same http connection as the "main" server you need to spin up two
which, in cloud run, isn't possible, as only one port is provided - so sticking to cloud run
would mean having multiple containers/services.

Given the above list of pros and cons, we think a REST approach is right
for an MVP, as it's a faster path forward and keeps infrastructure simpler.

## API specification

### Resources

#### `TestRunRequest`

```
{
    "commit_hash": string,
    "branch_name": string,
    "failures": [GoldenFailureRequest]
    "metadata?": {
        [string]: string,
    },
}
```

#### `GoldenFailureRequest`

```
{
    "fullName": string,
    "updated": FileRequest
    "original?": FileRequest
    "additional": [FileRequest]
}
```

#### `FileRequest`

```
{
    "label": string, // original | updated | diff | ... ignored for updated/original
    "fullName": string,
}
```

#### `TestRun`

```
{
    "id": string
    "status": "initial" | "partial" | "finished" | "error",
    "createdAt": string,
    "commit_hash": string,
    "branch_name": string,
    "failures": [GoldenFailure]
    "metadata?": {
        [string]: string,
    },
}
```

#### `GoldenFailure`

```
{
    "id": string,
    "status": "initial" | "partial" | "finished" | "error",
    "createdAt": string,
    "fullName": string,
    "updated": File
    "original?": File
    "additional": [File]
}
```

#### `File`

```
{
    "id": string,
    "status": "initial" | "partial" | "finished" | "error",
    "label": string, // original | updated | diff | ...
    "fullName": string,
    "contentType": string, // only available if "finished"
    "size": number, // only available if "finished"
}
```

### Endpoints

-   `/api/v1/projects/<project_id>/test_run`

    -   POST: creates a new test run. Body must be a `TestRunRequest`. On success, returns a `TestRun` resource
    -   Other methods not allowed

-   `/api/v1/projects/<project_id>/test_run/<test_run_id>`

    -   GET: Returns the relevant `TestRun` resource
    -   Other methods not allowed

-   `/api/v1/projects/<project_id>/test_run/<test_run_id>/failures/<test_failure_id>/files/<file_id>/object`
    -   POST: Upload the data (binary/text), requiring "Content-Type" header and "Content-Length".
        If the related File resource is in a "finished" state, POST will return a 409 Conflict.

### Open API spec

```yml
openapi: 3.0.3
info:
    title: File Upload API
    version: v1
    description: API for uploading files related to test runs and their failures.

servers:
    - url: /api/v1

components:
    schemas:
        FileRequest:
            type: object
            required:
                - label
                - relativePath
            properties:
                label:
                    type: string
                    description: "Label for the file (e.g., original, updated, diff). Ignored for 'updated' and 'original' in GoldenFailureRequest."
                relativePath:
                    type: string
                    description: "Path of the file, including filename and extension, relative to the repository root."
            example:
                label: "diff"
                relativePath: "test/golden/diffs/homepage_mobile_diff.png"

        GoldenFailureRequest:
            type: object
            required:
                - relativePath
                - updated
            properties:
                relativePath:
                    type: string
                    description: "Relative path of the image file that caused the failure (e.g., test/golden/homepage.png)."
                updated:
                    $ref: "#/components/schemas/FileRequest"
                original:
                    $ref: "#/components/schemas/FileRequest"
                additional:
                    type: array
                    items:
                        $ref: "#/components/schemas/FileRequest"
            example:
                relativePath: "test/specs/ui/homepage_mobile.test.js"
                updated:
                    label: "updated"
                    relativePath: "test/golden/homepage/homepage_mobile.png"
                original:
                    label: "original"
                    relativePath: "test/golden/expected/homepage_mobile.png"
                additional:
                    - label: "diff"
                      relativePath: "test/golden/diffs/homepage_mobile_diff.png"

        TestRunRequest:
            type: object
            required:
                - commit_hash
                - branch_name
                - failures
            properties:
                commit_hash:
                    type: string
                    description: "The commit hash associated with this test run."
                branch_name:
                    type: string
                    description: "The branch name associated with this test run."
                failures:
                    type: array
                    items:
                        $ref: "#/components/schemas/GoldenFailureRequest"
                metadata:
                    type: object
                    additionalProperties:
                        type: string
                    description: "Optional key-value metadata for the test run."
            example:
                commit_hash: "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0"
                branch_name: "feature/new-homepage"
                failures:
                    - relativePath: "test/golden/homepage_mobile.png"
                      updated:
                          label: "updated"
                          relativePath: "test/golden/failures/homepage_mobile.png"
                      original:
                          label: "original"
                          relativePath: "test/golden/homepage_mobile.png"
                metadata:
                    buildNumber: "12345"
                    environment: "staging"

        File:
            type: object
            required:
                - id
                - status
                - label
                - relativePath
            properties:
                id:
                    type: string
                    format: uuid
                    description: "Unique identifier for the file."
                status:
                    type: string
                    enum: [initial, partial, finished, error]
                    description: "Upload status of the file."
                label:
                    type: string
                    description: "Label for the file (e.g., original, updated, diff)."
                relativePath:
                    type: string
                    description: "Path of the file, including filename and extension, relative to the repository root."
                contentType:
                    type: string
                    description: "MIME type of the file. Only available if status is 'finished'."
                size:
                    type: integer
                    format: int64
                    description: "Size of the file in bytes. Only available if status is 'finished'."
            example:
                id: "f1e2d3c4-b5a6-7890-1234-567890abcdef"
                status: "finished"
                label: "updated"
                relativePath: "test/golden/homepage/homepage_mobile.png"
                contentType: "image/png"
                size: 102400

        GoldenFailure:
            type: object
            required:
                - id
                - status
                - createdAt
                - relativePath
                - updated
            properties:
                id:
                    type: string
                    format: uuid
                    description: "Unique identifier for the golden failure."
                status:
                    type: string
                    enum: [initial, partial, finished, error]
                    description: "Status of processing this failure."
                createdAt:
                    type: string
                    format: date-time
                    description: "Timestamp of when the failure was recorded."
                relativePath:
                    type: string
                    description: "Relative path of the image file that caused the failure (e.g., test/golden/homepage.png)."
                updated:
                    $ref: "#/components/schemas/File"
                original:
                    $ref: "#/components/schemas/File"
                additional:
                    type: array
                    items:
                        $ref: "#/components/schemas/File"
            example:
                id: "gf1e2d3c-b5a6-7890-1234-567890abcdef"
                status: "finished"
                createdAt: "2024-05-23T10:30:00Z"
                relativePath: "test/golden/homepage_mobile.png"
                updated:
                    id: "f1e2d3c4-b5a6-7890-1234-567890abcdef"
                    status: "finished"
                    label: "updated"
                    relativePath: "test/golden/failures/homepage_mobile.png"
                    contentType: "image/png"
                    size: 102400

        TestRun:
            type: object
            required:
                - id
                - status
                - createdAt
                - commit_hash
                - branch_name
                - failures
            properties:
                id:
                    type: string
                    format: uuid
                    description: "Unique identifier for the test run."
                status:
                    type: string
                    enum: [initial, partial, finished, error]
                    description: "Overall status of the test run."
                createdAt:
                    type: string
                    format: date-time
                    description: "Timestamp of when the test run was created."
                commit_hash:
                    type: string
                    description: "The commit hash associated with this test run."
                branch_name:
                    type: string
                    description: "The branch name associated with this test run."
                failures:
                    type: array
                    items:
                        $ref: "#/components/schemas/GoldenFailure"
                metadata:
                    type: object
                    additionalProperties:
                        type: string
                    description: "Optional key-value metadata for the test run."
            example:
                id: "tr1e2d3c-b5a6-7890-1234-567890abcdef"
                status: "finished"
                createdAt: "2024-05-23T10:00:00Z"
                commit_hash: "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0"
                branch_name: "feature/new-homepage"
                failures:
                    - id: "gf1e2d3c-b5a6-7890-1234-567890abcdef"
                      status: "finished"
                      createdAt: "2024-05-23T10:30:00Z"
                      relativePath: "test/specs/ui/homepage_mobile.test.js"
                      updated:
                          id: "f1e2d3c4-b5a6-7890-1234-567890abcdef"
                          status: "finished"
                          label: "updated"
                          relativePath: "test/golden/homepage/homepage_mobile.png"
                          contentType: "image/png"
                          size: 102400
                metadata:
                    buildNumber: "12345"
                    environment: "staging"

    parameters:
        ProjectId:
            name: project_id
            in: path
            required: true
            description: Identifier of the project.
            schema:
                type: string
            example: "my-awesome-project"
        TestRunId:
            name: test_run_id
            in: path
            required: true
            description: Identifier of the test run.
            schema:
                type: string
                format: uuid
            example: "tr1e2d3c-b5a6-7890-1234-567890abcdef"
        TestFailureId:
            name: test_failure_id
            in: path
            required: true
            description: Identifier of the test failure.
            schema:
                type: string
                format: uuid
            example: "gf1e2d3c-b5a6-7890-1234-567890abcdef"
        FileId:
            name: file_id
            in: path
            required: true
            description: Identifier of the file.
            schema:
                type: string
                format: uuid
            example: "f1e2d3c4-b5a6-7890-1234-567890abcdef"

paths:
    /projects/{project_id}/test_run:
        post:
            summary: Create a new test run
            description: Creates a new test run and associates failures and file metadata with it. The actual file binary data needs to be uploaded separately.
            tags:
                - TestRuns
            parameters:
                - $ref: "#/components/parameters/ProjectId"
            requestBody:
                required: true
                content:
                    application/json:
                        schema:
                            $ref: "#/components/schemas/TestRunRequest"
            responses:
                "201":
                    description: Test run created successfully.
                    content:
                        application/json:
                            schema:
                                $ref: "#/components/schemas/TestRun"
                "400":
                    description: Invalid request payload.
                "405":
                    description: Method Not Allowed.

    /projects/{project_id}/test_run/{test_run_id}:
        get:
            summary: Get a test run
            description: Retrieves the details of a specific test run.
            tags:
                - TestRuns
            parameters:
                - $ref: "#/components/parameters/ProjectId"
                - $ref: "#/components/parameters/TestRunId"
            responses:
                "200":
                    description: Successful retrieval of test run.
                    content:
                        application/json:
                            schema:
                                $ref: "#/components/schemas/TestRun"
                "404":
                    description: Test run not found.
                "405":
                    description: Method Not Allowed.

    /projects/{project_id}/test_run/{test_run_id}/failures/{test_failure_id}/files/{file_id}/object:
        post:
            summary: Upload file data
            description: Uploads the binary/text data for a specific file associated with a test failure.
            tags:
                - Files
            parameters:
                - $ref: "#/components/parameters/ProjectId"
                - $ref: "#/components/parameters/TestRunId"
                - $ref: "#/components/parameters/TestFailureId"
                - $ref: "#/components/parameters/FileId"
            requestBody:
                required: true
                content:
                    application/octet-stream: {}
                    text/plain: {}
                    image/png: {}
                    image/jpeg: {}
                    image/gif: {}
                    image/svg+xml: {}
                    image/webp: {}
            responses:
                "200":
                    description: File uploaded successfully. The associated File resource status should be updated.
                "400":
                    description: Bad request (e.g., missing Content-Type or Content-Length).
                "404":
                    description: Resource not found (e.g., project, test run, failure, or file metadata).
                "409":
                    description: Conflict. The related File resource is already in a "finished" state.
                "413":
                    description: Payload Too Large (if file exceeds max size).
```
