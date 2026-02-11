const s3 = require('@aws-sdk/client-s3');
const libStorage = require('@aws-sdk/lib-storage');
const { NodeHttpHandler } = require('@aws-sdk/node-http-handler');
const env = require('#env');

const client = new s3.S3Client({
    region: env.S3_REGION,
    endpoint: env.S3_ENDPOINT,
    credentials: {
        accessKeyId: env.S3_ACCESS_KEY,
        secretAccessKey: env.S3_SECRET_KEY
    },
    forcePathStyle: env.S3_FORCE_PATH_STYLE,
    requestHandler: new NodeHttpHandler({
        connectionTimeout: 1000 * 5,
        socketTimeout: 1000 * 60
    })
});

module.exports = {
    /**
     * Upload to S3.
     * @param {string} Bucket The name of the bucket to upload to
     * @param {string} Key The target object key
     * @param {*} Body The object body
     * @returns A promise that resolves when the upload finishes
     */
    upload: async (Bucket, Key, Body, ContentType = 'application/octet-stream') => {
        const upload = new libStorage.Upload({
            client,
            params: { Bucket, Key, Body, ContentType },
            partSize: 1024 * 1024 * 64 // 64 MB part size
        });
        return upload.done();
    },

    /**
     * Delete from S3.
     * @param {string} Bucket The name of the bucket to delete from
     * @param {string} Key The object key to delete
     */
    delete: async (Bucket, Key) => {
        try {
            return await client.send(new s3.DeleteObjectCommand({ Bucket, Key }));
        } catch (e) {
            // Ignore if file is already gone, otherwise throw
            if (e.name !== 'NotFound') throw e;
        }
    },

    /**
     * Copy an object within the same bucket (used for renaming/moving).
     * @param {string} sourceKey The key of the file to copy
     * @param {string} destKey The new key destination
     */
    copy: async (Bucket, sourceKey, destKey) => {
        return client.send(
            new s3.CopyObjectCommand({
                Bucket,
                CopySource: `${Bucket}/${sourceKey}`,
                Key: destKey
            })
        );
    },

    /**
     * Check if an object exists on S3.
     * @param {string} Bucket The bucket to check in
     * @param {string} Key The key to check for existence
     * @returns {boolean}
     */
    exists: async (Bucket, Key) => {
        try {
            const head = await client.send(new s3.HeadObjectCommand({ Bucket, Key }));
            return true; // OR return head (if you want size/etag)
        } catch (e) {
            if (e.name === 'NotFound') return false;
            throw e;
        }
    },

    /**
     * List all objects in the bucket. Yields objects one by one.
     *
     * Handles pagination automatically.
     * @param {string} Bucket The bucket name
     * @param {string} Prefix Optional folder prefix
     */
    list: async function* (Bucket, Prefix = '') {
        let continuationToken;
        do {
            const command = new s3.ListObjectsV2Command({
                Bucket,
                Prefix,
                ContinuationToken: continuationToken
            });
            const response = await client.send(command);

            // Yield each file found in this page
            if (response.Contents) {
                for (const file of response.Contents) {
                    yield file;
                }
            }

            // Prepare for next page
            continuationToken = response.NextContinuationToken;
        } while (continuationToken);
    },

    /**
     * Get an object file stream from S3.
     * @param {string} Bucket The bucket
     * @param {string} Key The object key
     */
    getStream: async (Bucket, Key) => {
        const command = new s3.GetObjectCommand({ Bucket, Key });
        const response = await client.send(command);
        return response.Body; // This is a readable stream
    },

    /**
     * Get a public object download URL using the configured `S3_PUBLIC_BASE_URL`.
     * @param {string} Key The key
     * @returns The resulting URL
     */
    getPublicUrl: Key => {
        const baseUrl = env.S3_PUBLIC_BASE_URL || '';
        // Handles missing slashes automatically
        return `${baseUrl.replace(/\/$/, '')}/${Key.replace(/^\//, '')}`;
    }
};
