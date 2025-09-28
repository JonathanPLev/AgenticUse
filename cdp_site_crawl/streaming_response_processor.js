// streaming_response_processor.js
// Streams response bodies directly to disk to avoid memory accumulation
// while preserving complete data for analysis

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

class StreamingResponseProcessor {
  constructor(outputDir) {
    this.outputDir = outputDir;
    this.responseStreams = new Map(); // Track active streams
    this.responseMetadata = new Map(); // Track response metadata
    this.responseBuffers = new Map(); // Buffer response data as it arrives
  }

  // Generate unique filename for response body
  generateResponseFilename(requestId, url, mimeType) {
    const urlHash = crypto.createHash('md5').update(url).digest('hex').substring(0, 8);
    const extension = this.getExtensionFromMimeType(mimeType);
    return `response_${requestId}_${urlHash}${extension}`;
  }

  getExtensionFromMimeType(mimeType) {
    const mimeMap = {
      'application/json': '.json',
      'text/html': '.html',
      'text/css': '.css',
      'application/javascript': '.js',
      'text/javascript': '.js',
      'application/xml': '.xml',
      'text/xml': '.xml',
      'text/plain': '.txt',
      'application/pdf': '.pdf',
      'image/jpeg': '.jpg',
      'image/png': '.png',
      'image/gif': '.gif',
      'image/svg+xml': '.svg'
    };
    return mimeMap[mimeType] || '.bin';
  }

  // Buffer response data as it arrives from Network.dataReceived events
  bufferResponseData(requestId, data, dataLength) {
    if (!this.responseBuffers.has(requestId)) {
      this.responseBuffers.set(requestId, []);
    }
    this.responseBuffers.get(requestId).push(data);
  }

  // Get buffered response data and clear buffer
  getBufferedResponseData(requestId) {
    const buffers = this.responseBuffers.get(requestId);
    this.responseBuffers.delete(requestId);
    return buffers ? buffers.join('') : null;
  }

  // Start streaming a response body to disk
  async startResponseStream(client, requestId, url, mimeType, headers, status, responseBody = null) {
    try {
      const filename = this.generateResponseFilename(requestId, url, mimeType);
      const filepath = path.join(this.outputDir, 'responses', filename);
      
      // Ensure responses directory exists
      const responsesDir = path.dirname(filepath);
      if (!fs.existsSync(responsesDir)) {
        fs.mkdirSync(responsesDir, { recursive: true });
      }

      // Create write stream
      const writeStream = fs.createWriteStream(filepath);
      this.responseStreams.set(requestId, {
        stream: writeStream,
        filepath,
        filename,
        bytesWritten: 0,
        startTime: Date.now()
      });

      // Store metadata separately (small memory footprint)
      this.responseMetadata.set(requestId, {
        url,
        mimeType,
        headers: this.extractEssentialHeaders(headers),
        status,
        filename,
        filepath,
        timestamp: Date.now()
      });

      let bodyWritten = false;

      // Try buffered response data first (from Network.dataReceived events)
      const bufferedData = this.getBufferedResponseData(requestId);
      if (bufferedData) {
        try {
          const chunkSize = 64 * 1024; // 64KB chunks
          for (let i = 0; i < bufferedData.length; i += chunkSize) {
            const chunk = bufferedData.substring(i, i + chunkSize);
            writeStream.write(chunk);
            this.responseStreams.get(requestId).bytesWritten += chunk.length;
          }
          bodyWritten = true;
        } catch (error) {
          console.warn(`Error writing buffered response data: ${error.message}`);
        }
      }

      // Try to use provided response body second (from Network.responseReceived event)
      if (!bodyWritten && responseBody) {
        try {
          const chunkSize = 64 * 1024; // 64KB chunks
          for (let i = 0; i < responseBody.length; i += chunkSize) {
            const chunk = responseBody.substring(i, i + chunkSize);
            writeStream.write(chunk);
            this.responseStreams.get(requestId).bytesWritten += chunk.length;
          }
          bodyWritten = true;
        } catch (error) {
          console.warn(`Error writing provided response body: ${error.message}`);
        }
      }

      // Fallback: try to get response body via CDP (may fail for cached/streamed responses)
      if (!bodyWritten) {
        try {
          const bodyResponse = await client.send('Network.getResponseBody', { requestId });
          if (bodyResponse && bodyResponse.body) {
            const body = bodyResponse.body;
            const chunkSize = 64 * 1024; // 64KB chunks
            
            for (let i = 0; i < body.length; i += chunkSize) {
              const chunk = body.substring(i, i + chunkSize);
              writeStream.write(chunk);
              this.responseStreams.get(requestId).bytesWritten += chunk.length;
            }
            bodyWritten = true;
          }
        } catch (bodyError) {
          // Common for cached responses, redirects, failed requests, or large streaming responses
          const errorInfo = {
            error: bodyError.message,
            url,
            status,
            mimeType,
            timestamp: new Date().toISOString(),
            note: 'Response body not available - common for cached, failed, redirect, or streaming responses'
          };
          writeStream.write(JSON.stringify(errorInfo, null, 2));
        }
      }

      // Close stream
      writeStream.end();
      
      // Update final metadata with null checks
      const streamInfo = this.responseStreams.get(requestId);
      const baseMetadata = this.responseMetadata.get(requestId) || {};
      const finalMetadata = {
        ...baseMetadata,
        bytesWritten: streamInfo?.bytesWritten || 0,
        processingTime: streamInfo ? Date.now() - streamInfo.startTime : 0,
        completed: true
      };

      // Clean up stream reference
      this.responseStreams.delete(requestId);
      
      return finalMetadata;

    } catch (error) {
      console.warn(`Error streaming response ${requestId}: ${error.message}`);
      this.responseStreams.delete(requestId);
      
      // Return safe metadata even on error
      return {
        url: url || 'unknown',
        filename: null,
        filepath: null,
        bytesWritten: 0,
        processingTime: 0,
        completed: false,
        error: error.message,
        timestamp: Date.now()
      };
    }
  }

  // Extract only essential headers to minimize memory usage
  extractEssentialHeaders(headers) {
    if (!headers) return {};
    
    const essential = {};
    const importantHeaders = [
      'content-type', 'content-length', 'content-encoding',
      'cache-control', 'expires', 'last-modified',
      'server', 'x-powered-by', 'set-cookie'
    ];
    
    for (const key of importantHeaders) {
      if (headers[key]) {
        essential[key] = headers[key];
      }
    }
    
    return essential;
  }

  // Stream HTML content to disk
  async streamHTMLContent(frameId, url, htmlContent, outputDir) {
    try {
      const urlHash = crypto.createHash('md5').update(url).digest('hex').substring(0, 8);
      const filename = `frame_${frameId}_${urlHash}.html`;
      const filepath = path.join(outputDir, 'html_content', filename);
      
      // Ensure directory exists
      const htmlDir = path.dirname(filepath);
      if (!fs.existsSync(htmlDir)) {
        fs.mkdirSync(htmlDir, { recursive: true });
      }

      // Stream HTML content in chunks
      const writeStream = fs.createWriteStream(filepath);
      const chunkSize = 64 * 1024; // 64KB chunks
      let bytesWritten = 0;

      for (let i = 0; i < htmlContent.length; i += chunkSize) {
        const chunk = htmlContent.substring(i, i + chunkSize);
        writeStream.write(chunk);
        bytesWritten += chunk.length;
      }

      writeStream.end();

      return {
        filename,
        filepath,
        bytesWritten,
        originalSize: htmlContent.length,
        frameId,
        url,
        timestamp: Date.now()
      };

    } catch (error) {
      console.warn(`Error streaming HTML content: ${error.message}`);
      return null;
    }
  }

  // Stream script source to disk
  async streamScriptSource(scriptId, url, scriptSource, outputDir) {
    try {
      const urlHash = url ? crypto.createHash('md5').update(url).digest('hex').substring(0, 8) : 'inline';
      const filename = `script_${scriptId}_${urlHash}.js`;
      const filepath = path.join(outputDir, 'scripts', filename);
      
      // Ensure directory exists
      const scriptsDir = path.dirname(filepath);
      if (!fs.existsSync(scriptsDir)) {
        fs.mkdirSync(scriptsDir, { recursive: true });
      }

      // Stream script source in chunks
      const writeStream = fs.createWriteStream(filepath);
      const chunkSize = 64 * 1024; // 64KB chunks
      let bytesWritten = 0;

      for (let i = 0; i < scriptSource.length; i += chunkSize) {
        const chunk = scriptSource.substring(i, i + chunkSize);
        writeStream.write(chunk);
        bytesWritten += chunk.length;
      }

      writeStream.end();

      return {
        filename,
        filepath,
        bytesWritten,
        originalSize: scriptSource.length,
        scriptId,
        url,
        timestamp: Date.now()
      };

    } catch (error) {
      console.warn(`Error streaming script source: ${error.message}`);
      return null;
    }
  }

  // Get current memory usage stats
  getMemoryStats() {
    return {
      activeStreams: this.responseStreams.size,
      metadataEntries: this.responseMetadata.size,
      memoryUsage: process.memoryUsage()
    };
  }

  // Cleanup method
  cleanup() {
    // Close any remaining streams
    for (const [requestId, streamInfo] of this.responseStreams.entries()) {
      try {
        streamInfo.stream.end();
      } catch (error) {
        console.warn(`Error closing stream ${requestId}: ${error.message}`);
      }
    }
    
    this.responseStreams.clear();
    this.responseMetadata.clear();
    this.responseBuffers.clear();
  }
}

module.exports = { StreamingResponseProcessor };
