import grpc from "@grpc/grpc-js";
import protoLoader from "@grpc/proto-loader";
import path from "path";
import { existsSync, mkdirSync, promises as fsPromises } from "fs"; // Using fs.promises for async operations
import { fileURLToPath } from "url";

// Replicate __dirname for ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PROTO_PATH = path.join(__dirname, "uploader.proto");
const UPLOAD_DIR = path.join(__dirname, "uploads");

if (!existsSync(UPLOAD_DIR)) {
    mkdirSync(UPLOAD_DIR);
}

const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
    keepCase: true,
    longs: String,
    enums: String,
    defaults: true,
    oneofs: true,
});

const uploaderPkg = grpc.loadPackageDefinition(packageDefinition).uploader;
const { FileUploader } = uploaderPkg; // Get the service constructor

async function saveFile(fileInfo, contentBuffer) {
    const filePathDir = path.join(UPLOAD_DIR, fileInfo.file_path || "");
    const fileName = fileInfo.file_name;
    const fullPath = path.join(filePathDir, fileName);

    try {
        if (!existsSync(filePathDir)) {
            mkdirSync(filePathDir, { recursive: true });
        }
        await fsPromises.writeFile(fullPath, contentBuffer);
        console.log(`File saved: ${fullPath}`);
        return path.join(fileInfo.file_path || "", fileName);
    } catch (err) {
        console.error(`Error saving file ${fullPath}:`, err);
        throw err;
    }
}

// --- gRPC Service Implementation ---
async function uploadFiles(call, callback) {
    // Made outer function async to use await inside directly if needed, though event handlers are tricky
    console.log("Client connected for file upload.");
    let currentUpload = {
        metadata: null,
        filesToProcess: [],
        currentFileIndex: -1,
        uploadedFilePaths: [],
        saveFilePromises: [],
    };

    call.on("data", async (request) => {
        console.log("Received data from client:", request);
        try {
            if (request.metadata) {
                if (currentUpload.metadata) {
                    console.error(
                        "Metadata already received. Terminating stream."
                    );
                    call.emit(
                        "error",
                        new Error("Metadata can only be sent once.")
                    );
                    return;
                }
                console.log(
                    "Received metadata:",
                    JSON.stringify(request.metadata, null, 2)
                );
                currentUpload.metadata = request.metadata;
                currentUpload.uploadedFilePaths = [];

                const { changed_file, original_file, additional_files } =
                    request.metadata;

                if (changed_file) {
                    currentUpload.filesToProcess.push({
                        fileInfo: changed_file,
                        receivedChunks: [],
                        isComplete: false,
                    });
                }
                if (original_file) {
                    currentUpload.filesToProcess.push({
                        fileInfo: original_file,
                        receivedChunks: [],
                        isComplete: false,
                    });
                }
                if (additional_files && additional_files.length > 0) {
                    additional_files.forEach((file) => {
                        currentUpload.filesToProcess.push({
                            fileInfo: file,
                            receivedChunks: [],
                            isComplete: false,
                        });
                    });
                }

                for (let i = 0; i < currentUpload.filesToProcess.length; i++) {
                    const fileEntry = currentUpload.filesToProcess[i];
                    if (
                        fileEntry.fileInfo.raw_data &&
                        fileEntry.fileInfo.raw_data.length > 0
                    ) {
                        console.log(
                            `Deferring saving file ${fileEntry.fileInfo.file_name} from metadata raw_data.`
                        );
                        const savedPath = saveFile(
                            fileEntry.fileInfo,
                            Buffer.from(fileEntry.fileInfo.raw_data)
                        );
                        currentUpload.saveFilePromises.push(savedPath);
                        fileEntry.isComplete = true;
                    }
                }

                currentUpload.currentFileIndex =
                    currentUpload.filesToProcess.findIndex(
                        (f) => !f.isComplete
                    );
                if (currentUpload.currentFileIndex !== -1) {
                    console.log(
                        `Expecting chunks for: ${
                            currentUpload.filesToProcess[
                                currentUpload.currentFileIndex
                            ].fileInfo.file_name
                        }`
                    );
                } else {
                    console.log(
                        "All files were sent via metadata or no files needed chunking."
                    );
                }
            } else if (request.chunk) {
                if (!currentUpload.metadata) {
                    console.error(
                        "Chunk received before metadata. Terminating stream."
                    );
                    call.emit(
                        "error",
                        new Error("Metadata must be sent first.")
                    );
                    return;
                }

                if (
                    currentUpload.currentFileIndex === -1 ||
                    currentUpload.currentFileIndex >=
                        currentUpload.filesToProcess.length
                ) {
                    console.error(
                        "Received chunk but not expecting any more files or filesToProcess is empty."
                    );
                    call.emit("error", new Error("Received unexpected chunk."));
                    return;
                }

                const currentFileEntry =
                    currentUpload.filesToProcess[
                        currentUpload.currentFileIndex
                    ];
                if (currentFileEntry.isComplete) {
                    console.error(
                        `Received chunk for already completed file: ${currentFileEntry.fileInfo.file_name}`
                    );
                    call.emit(
                        "error",
                        new Error(
                            `Received chunk for already completed file: ${currentFileEntry.fileInfo.file_name}`
                        )
                    );
                    return;
                }

                console.log(
                    `Received chunk for ${currentFileEntry.fileInfo.file_name} (size: ${request.chunk.content.length} bytes)`
                );
                currentFileEntry.receivedChunks.push(
                    Buffer.from(request.chunk.content)
                ); // Ensure it's a Buffer

                if (request.chunk.is_last_chunk_for_current_file) {
                    console.log(
                        `Last chunk received for ${currentFileEntry.fileInfo.file_name}. Assembling and saving...`
                    );
                    const fullFileContent = Buffer.concat(
                        currentFileEntry.receivedChunks
                    );
                    const savedPath = saveFile(
                        currentFileEntry.fileInfo,
                        fullFileContent
                    );
                    currentUpload.saveFilePromises.push(savedPath);
                    // currentUpload.uploadedFilePaths.push(savedPath);
                    currentFileEntry.isComplete = true;
                    currentFileEntry.receivedChunks = [];

                    currentUpload.currentFileIndex =
                        currentUpload.filesToProcess.findIndex(
                            (f, idx) =>
                                idx > currentUpload.currentFileIndex &&
                                !f.isComplete
                        );

                    if (currentUpload.currentFileIndex !== -1) {
                        console.log(
                            `Expecting chunks for next file: ${
                                currentUpload.filesToProcess[
                                    currentUpload.currentFileIndex
                                ].fileInfo.file_name
                            }`
                        );
                    } else {
                        console.log(
                            "All expected chunked files have been received."
                        );
                    }
                }
            } else {
                console.warn("Received an empty or unknown request part.");
            }
        } catch (error) {
            // Catch errors from async operations like saveFile
            console.error(`Error processing data event: ${error.message}`);
            call.emit("error", error); // Propagate the error to the stream's error handler
        }

        const allFilesProcessed = currentUpload.filesToProcess.every(
            (f) => f.isComplete
        );
        if (allFilesProcessed) {
            console.log("All files processed successfully.");
            currentUpload.uploadedFilePaths = await Promise.all(
                currentUpload.saveFilePromises
            );
            callback(null, {
                success: true,
                message: "All files processed successfully.",
                uploaded_file_paths: currentUpload.uploadedFilePaths,
            });
        } else {
            console.log(
                `Current upload state: ${JSON.stringify(
                    currentUpload,
                    null,
                    2
                )}`
            );
        }
    });

    call.on("end", async () => {
        console.log("Client stream ended.");
        const allFilesProcessed = currentUpload.filesToProcess.every(
            (f) => f.isComplete
        );
        currentUpload.uploadedFilePaths = await Promise.all(
            currentUpload.saveFilePromises
        );

        if (currentUpload.metadata && allFilesProcessed) {
            callback(null, {
                success: true,
                message: "All files processed successfully.",
                uploaded_file_paths: currentUpload.uploadedFilePaths,
            });
        } else if (!currentUpload.metadata) {
            callback({
                code: grpc.status.INVALID_ARGUMENT,
                message: "No metadata received.",
            });
        } else {
            console.warn(
                "Stream ended but not all declared files were completely uploaded via chunks."
            );
            callback({
                code: grpc.status.DATA_LOSS,
                message:
                    "Stream ended prematurely. Not all declared files were completely uploaded.",
                uploaded_file_paths: currentUpload.uploadedFilePaths,
            });
        }
    });

    call.on("error", (err) => {
        console.error("Error in uploadFiles stream:", err.message);
        // Avoid sending headers twice if callback already invoked by an earlier emitted error
        if (!call.call.sendStatus) {
            // A bit of a hack, check if status already sent
            if (
                err.message &&
                (err.message.includes("Metadata must be sent first") ||
                    err.message.includes("Metadata already received"))
            ) {
                callback({
                    code: grpc.status.INVALID_ARGUMENT,
                    message: err.message,
                });
            } else if (!err.code) {
                callback({
                    code: grpc.status.INTERNAL,
                    message:
                        err.message ||
                        "An internal server error occurred during upload.",
                });
            } else {
                callback(err);
            }
        }
    });
}

const server = new grpc.Server();

server.addService(FileUploader.service, { UploadFiles: uploadFiles });

const port = "0.0.0.0:50051";
server.bindAsync(
    port,
    grpc.ServerCredentials.createInsecure(),
    (err, portNum) => {
        if (err) {
            console.error("Server bind error:", err);
            return;
        }
        server.start();
        console.log(`Server listening on ${port}`);
    }
);
