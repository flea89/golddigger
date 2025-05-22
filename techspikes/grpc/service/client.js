import grpc from "@grpc/grpc-js";
import protoLoader from "@grpc/proto-loader";
import path from "path";
import { promises as fsPromises, readFileSync } from "fs"; // For readFile and readFileSync
import { fileURLToPath } from "url";

// Replicate __dirname for ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PROTO_PATH = path.join(__dirname, "uploader.proto");
const SAMPLE_FILES_DIR = path.join(__dirname, "sample-files");
const CHUNK_SIZE = 1024 * 1024; // 1 MB

const packageDefinition = protoLoader.loadSync(PROTO_PATH, {
    keepCase: true,
    longs: String,
    enums: String,
    defaults: true,
    oneofs: true,
});

const uploaderPkg = grpc.loadPackageDefinition(packageDefinition).uploader;
const { FileUploader } = uploaderPkg; // Get the client constructor

const client = new FileUploader(
    "localhost:50051",
    grpc.credentials.createInsecure()
);

async function streamFileChunks(
    clientStream,
    filePathOnDisk,
    fileNameOnServer
) {
    console.log(
        `Streaming chunks for ${fileNameOnServer} from ${filePathOnDisk}...`
    );
    const fileBuffer = await fsPromises.readFile(filePathOnDisk);
    let offset = 0;
    while (offset < fileBuffer.length) {
        const end = Math.min(offset + CHUNK_SIZE, fileBuffer.length);
        const chunkContent = fileBuffer.subarray(offset, end);
        const isLast = end === fileBuffer.length;

        // console.log(`Client: Sending chunk for ${fileNameOnServer}: ${offset}-${end} (last: ${isLast})`);
        clientStream.write({
            chunk: {
                content: chunkContent,
                is_last_chunk_for_current_file: isLast,
            },
        });
        offset = end;
        // Optional delay for observing logs, not for production
        // await new Promise(resolve => setTimeout(resolve, 5));
    }
    console.log(`Finished streaming chunks for ${fileNameOnServer}`);
}

async function main() {
    const call = client.UploadFiles((error, response) => {
        if (error) {
            console.error("Client: Error from server:", error.message);
            if (error.details) console.error("Client: Details:", error.details);
            return;
        }
        console.log(
            "Client: Server Response:",
            JSON.stringify(response, null, 2)
        );
    });

    // 1. Prepare Metadata
    const changedFile = {
        file_name: "changed_file.txt",
        file_path: "projectA/featureX",
        raw_data: Buffer.from(""), // Stream this file
    };

    const originalFile = {
        file_name: "original_file.txt",
        file_path: "projectA/featureX",
        raw_data: readFileSync(path.join(SAMPLE_FILES_DIR, "original.txt")), // Send this one in metadata
    };

    const additionalFiles = [
        {
            file_name: "extra_log.txt",
            file_path: "logs/prod",
            raw_data: readFileSync(path.join(SAMPLE_FILES_DIR, "extra1.log")),
        },
        {
            file_name: "big_data.bin",
            file_path: "data/archive",
            raw_data: Buffer.from(""), // Stream this potentially large file
        },
    ];

    const uploadMetadata = {
        changed_file: changedFile,
        original_file: originalFile,
        additional_files: additionalFiles,
        custom_metadata: {
            branch_name: "feature/new-upload-esm",
            commit_hash: "e5f6a7b8",
            project_id: "project-epsilon",
        },
    };

    console.log("Client: Sending metadata...");
    call.write({ metadata: uploadMetadata });

    // 2. Stream files whose raw_data was empty, in order
    if (changedFile.raw_data.length === 0) {
        console.log(`Client: Preparing to stream: ${changedFile.file_name}`);
        await streamFileChunks(
            call,
            path.join(SAMPLE_FILES_DIR, "changed.txt"),
            changedFile.file_name,
            changedFile.file_path
        );
    }

    for (const addFile of additionalFiles) {
        if (addFile.raw_data.length === 0) {
            let actualDiskFileName = addFile.file_name; // Assume it matches by default
            if (addFile.file_name === "big_data.bin") {
                actualDiskFileName = "large_additional.bin"; // Map to actual file on disk
            }
            console.log(
                `Client: Preparing to stream: ${addFile.file_name} (from local file: ${actualDiskFileName})`
            );
            await streamFileChunks(
                call,
                path.join(SAMPLE_FILES_DIR, actualDiskFileName),
                addFile.file_name,
                addFile.file_path
            );
        }
    }

    console.log("Client: All file data sent. Ending client stream.");
    call.end();
}

main().catch((err) => {
    console.error("Client encountered an unhandled error:", err);
});
