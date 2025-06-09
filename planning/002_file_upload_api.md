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

### Not in scope

The following considerations are important, but not part of this RFC:

-   Authentication
-   Rate limiting
-   Idempotency
-   General lifecycle (e.g. what happens to a request after upload, or when upload is not finished)

## API specification

Based on the above comparison we think a **REST** approach is right
for an MVP, as it's a faster path forward and keeps infrastructure simpler.

This API spec in OpenAPI 3 format is a snapshot at this time of the [spec file](/apis/file_upload.yml) which may change in the future.

```yml
openapi: 3.0.3
info:
    title: File Upload API
    version: v1
    description: API for uploading files related to test runs and their failures.

servers:
    - url: /api/v1

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
                    "*/*":
                        example: "any mime type allowd, text/ and image/ provide a better UI"
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

components:
    schemas:
        FileRequest:
            type: object
            required:
                - label
                - relativePath
            properties:
                label:
                    $ref: "#/components/schemas/FileLabel"
                relativePath:
                    $ref: "#/components/schemas/RelativePath"

        File:
            type: object
            required:
                - id
                - status
                - label
                - relativePath
            properties:
                id:
                    $ref: "#/components/schemas/Id"
                status:
                    $ref: "#/components/schemas/Status"
                label:
                    $ref: "#/components/schemas/FileLabel"
                relativePath:
                    $ref: "#/components/schemas/RelativePath"
                contentType:
                    type: string
                    description: "MIME type of the file. Only available if status is 'finished'."
                size:
                    type: integer
                    description: "Size of the file in bytes. Only available if status is 'finished'."

        GoldenFailureRequest:
            type: object
            required:
                - relativePath
                - updated
            properties:
                relativePath:
                    allOf:
                        - $ref: "#/components/schemas/RelativePath"
                        - description: "Relative path of the image file that caused the failure (e.g., test/golden/homepage.png)."
                updated:
                    allOf:
                        - $ref: "#/components/schemas/FileRequest"
                        - description: "Details of the 'updated' file. The 'label' in the FileRequest is contextually 'updated'; server may ignore or override the provided label."
                original:
                    allOf:
                        - $ref: "#/components/schemas/FileRequest"
                        - description: "Details of the 'original' file. The 'label' in the FileRequest is contextually 'original'; server may ignore or override the provided label."
                additional:
                    type: array
                    items:
                        $ref: "#/components/schemas/FileRequest"

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
                    allOf:
                        - $ref: "#/components/schemas/Id"
                        - description: "Unique identifier for the golden failure."
                status:
                    allOf:
                        - $ref: "#/components/schemas/Status"
                        - description: "Status of processing this failure."
                createdAt:
                    allOf:
                        - $ref: "#/components/schemas/CreatedAt"
                        - description: "Timestamp of when the failure was recorded."
                relativePath:
                    allOf:
                        - $ref: "#/components/schemas/RelativePath"
                        - description: "Relative path of the image file that caused the failure (e.g., test/golden/homepage.png)."
                updated:
                    $ref: "#/components/schemas/File"
                original:
                    $ref: "#/components/schemas/File"
                additional:
                    type: array
                    items:
                        $ref: "#/components/schemas/File"

        TestRunRequest:
            type: object
            required:
                - commit_hash
                - branch_name
                - failures
            properties:
                commit_hash:
                    $ref: "#/components/schemas/CommitHash"
                branch_name:
                    $ref: "#/components/schemas/BranchName"
                failures:
                    type: array
                    items:
                        $ref: "#/components/schemas/GoldenFailureRequest"
                metadata:
                    $ref: "#/components/schemas/Metadata"

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
                    $ref: "#/components/schemas/Id"
                status:
                    $ref: "#/components/schemas/Status"
                createdAt:
                    $ref: "#/components/schemas/CreatedAt"
                commit_hash:
                    $ref: "#/components/schemas/CommitHash"
                branch_name:
                    $ref: "#/components/schemas/BranchName"
                failures:
                    type: array
                    items:
                        $ref: "#/components/schemas/GoldenFailure"
                metadata:
                    $ref: "#/components/schemas/Metadata"
        Id:
            type: string
            format: uuid
            description: "Resource unique identifier."
        Status:
            type: string
            enum: [initial, started, finished, error]
            description: "Processing status."
        CreatedAt:
            type: string
            format: date-time
            description: "DateTime for when the resource was created."
        RelativePath:
            type: string
            description: "Path of the file, including filename and extension, relative to the repository root."
        FileLabel:
            type: string
            description: "Label for the file (e.g. original, updated, diff)."
        CommitHash:
            type: string
            description: "The commit hash associated with a test run."
        BranchName:
            type: string
            description: "The branch name associated with a test run."
        Metadata:
            type: object
            additionalProperties:
                type: string
            description: "Optional key-value metadata."

    parameters:
        ProjectId:
            name: project_id
            in: path
            required: true
            description: Identifier of the project.
            schema:
                $ref: "#/components/schemas/Id"
        TestRunId:
            name: test_run_id
            in: path
            required: true
            description: Identifier of the test run.
            schema:
                $ref: "#/components/schemas/Id"
        TestFailureId:
            name: test_failure_id
            in: path
            required: true
            description: Identifier of the test failure.
            schema:
                $ref: "#/components/schemas/Id"
        FileId:
            name: file_id
            in: path
            required: true
            description: Identifier of the file.
            schema:
                $ref: "#/components/schemas/Id"
```
