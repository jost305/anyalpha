const PINATA_API_URL = 'https://api.pinata.cloud';
const PINATA_JWT = import.meta.env.VITE_PINATA_JWT;

/**
 * Uploads a file (Blob/File) to Pinata IPFS
 * @param file The file object to upload
 * @returns The IPFS URI (e.g. ipfs://Qm...)
 */
export async function uploadFileToIPFS(file: File): Promise<string> {
  if (!PINATA_JWT) {
    throw new Error('Pinata JWT is not configured in environment variables.');
  }

  const formData = new FormData();
  formData.append('file', file);

  const response = await fetch(`${PINATA_API_URL}/pinning/pinFileToIPFS`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${PINATA_JWT}`,
    },
    body: formData,
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to upload file to IPFS: ${error}`);
  }

  const data = await response.json();
  return `ipfs://${data.IpfsHash}`;
}

/**
 * Uploads a JSON metadata object to Pinata IPFS
 * @param metadata The JSON object to upload
 * @returns The IPFS URI (e.g. ipfs://Qm...)
 */
export async function uploadJSONToIPFS(metadata: Record<string, any>): Promise<string> {
  if (!PINATA_JWT) {
    throw new Error('Pinata JWT is not configured in environment variables.');
  }

  const response = await fetch(`${PINATA_API_URL}/pinning/pinJSONToIPFS`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${PINATA_JWT}`,
    },
    body: JSON.stringify({
      pinataContent: metadata,
      pinataMetadata: {
        name: `metadata-${Date.now()}.json`,
      },
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to upload JSON to IPFS: ${error}`);
  }

  const data = await response.json();
  return `ipfs://${data.IpfsHash}`;
}

export function getIPFSUrl(uri: string): string {
  if (!uri) return '';
  if (uri.startsWith('ipfs://')) {
    return uri.replace('ipfs://', 'https://ipfs.io/ipfs/');
  }
  return uri;
}
