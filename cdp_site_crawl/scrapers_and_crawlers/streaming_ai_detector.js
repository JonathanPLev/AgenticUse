// streaming_ai_detector.js
// Real-time streaming AI detection with WebSocket and SSE monitoring

const EventEmitter = require('events');

class StreamingAIDetector extends EventEmitter {
    constructor() {
        super();
        this.activeStreams = new Map();
        this.streamPatterns = this.initializeStreamPatterns();
        this.bufferSize = 1024 * 16; // 16KB buffer for streaming data
        this.detectionBuffer = new Map();
    }
    
    initializeStreamPatterns() {
        return {
            // OpenAI streaming patterns
            openai: {
                startMarkers: ['data: {"id":', 'data: {"object":"chat.completion.chunk"'],
                contentPatterns: [/"delta":\s*\{[^}]*"content":\s*"([^"]+)"/g],
                endMarkers: ['data: [DONE]', '"finish_reason"'],
                confidence: 0.95
            },
            
            // Anthropic streaming patterns
            anthropic: {
                startMarkers: ['event: message_start', 'event: content_block_delta'],
                contentPatterns: [/"text":\s*"([^"]+)"/g, /"delta":\s*\{[^}]*"text":\s*"([^"]+)"/g],
                endMarkers: ['event: message_stop'],
                confidence: 0.95
            },
            
            // Generic streaming patterns
            generic: {
                startMarkers: ['data: {', 'event: '],
                contentPatterns: [
                    /"(?:content|text|message|response)":\s*"([^"]+)"/g,
                    /"(?:delta|chunk|token)":\s*"([^"]+)"/g
                ],
                endMarkers: ['[DONE]', '"finish_reason"', '"stop"'],
                confidence: 0.7
            },
            
            // WebSocket AI patterns
            websocket: {
                messageTypes: ['chat_completion', 'text_generation', 'ai_response'],
                payloadPatterns: [
                    /\{"type":\s*"(?:completion|generation|ai_message)"/g,
                    /\{"model":\s*"(?:gpt|claude|llama|palm)"/g
                ],
                confidence: 0.85
            }
        };
    }
    
    /**
     * Monitor WebSocket connection for AI streaming
     */
    monitorWebSocket(ws, siteUrl, wsUrl) {
        const streamId = `ws_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        this.activeStreams.set(streamId, {
            type: 'websocket',
            siteUrl,
            wsUrl,
            startTime: Date.now(),
            messageCount: 0,
            aiDetected: false
        });
        
        ws.on('message', (data) => {
            this.processWebSocketMessage(streamId, data, siteUrl);
        });
        
        ws.on('close', () => {
            this.finalizeStream(streamId);
        });
        
        return streamId;
    }
    
    /**
     * Monitor Server-Sent Events for AI streaming
     */
    monitorSSE(response, siteUrl, requestUrl) {
        const streamId = `sse_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        
        this.activeStreams.set(streamId, {
            type: 'sse',
            siteUrl,
            requestUrl,
            startTime: Date.now(),
            chunkCount: 0,
            aiDetected: false,
            buffer: ''
        });
        
        response.on('data', (chunk) => {
            this.processSSEChunk(streamId, chunk, siteUrl);
        });
        
        response.on('end', () => {
            this.finalizeStream(streamId);
        });
        
        return streamId;
    }
    
    /**
     * Process WebSocket message for AI patterns
     */
    processWebSocketMessage(streamId, data, siteUrl) {
        const stream = this.activeStreams.get(streamId);
        if (!stream) return;
        
        stream.messageCount++;
        
        try {
            const message = data.toString();
            const patterns = this.streamPatterns.websocket;
            
            // Check for AI message types
            const hasAIType = patterns.messageTypes.some(type => 
                message.toLowerCase().includes(type)
            );
            
            // Check payload patterns
            const hasAIPayload = patterns.payloadPatterns.some(pattern => 
                pattern.test(message)
            );
            
            if (hasAIType || hasAIPayload) {
                stream.aiDetected = true;
                
                this.emit('aiDetected', {
                    type: 'websocket_ai',
                    streamId,
                    siteUrl,
                    confidence: patterns.confidence,
                    evidence: {
                        messageType: hasAIType,
                        payloadPattern: hasAIPayload,
                        messageLength: message.length
                    }
                });
                
                console.log(`🔴 LIVE AI WebSocket detected on ${siteUrl}`);
            }
            
        } catch (error) {
            console.error(`Error processing WebSocket message: ${error.message}`);
        }
    }
    
    /**
     * Process Server-Sent Events chunk for AI patterns
     */
    processSSEChunk(streamId, chunk, siteUrl) {
        const stream = this.activeStreams.get(streamId);
        if (!stream) return;
        
        stream.chunkCount++;
        stream.buffer += chunk.toString();
        
        // Keep buffer size manageable
        if (stream.buffer.length > this.bufferSize) {
            stream.buffer = stream.buffer.slice(-this.bufferSize);
        }
        
        // Check each streaming pattern
        for (const [patternName, pattern] of Object.entries(this.streamPatterns)) {
            if (patternName === 'websocket') continue;
            
            const detection = this.analyzeStreamingPattern(stream.buffer, pattern);
            
            if (detection.detected && !stream.aiDetected) {
                stream.aiDetected = true;
                
                this.emit('aiDetected', {
                    type: 'sse_ai_streaming',
                    streamId,
                    siteUrl,
                    pattern: patternName,
                    confidence: detection.confidence,
                    evidence: {
                        startMarkers: detection.startMarkers,
                        contentMatches: detection.contentMatches,
                        endMarkers: detection.endMarkers
                    }
                });
                
                console.log(`🟡 LIVE AI SSE streaming detected: ${patternName} on ${siteUrl}`);
                break;
            }
        }
    }
    
    /**
     * Analyze buffer for streaming AI patterns
     */
    analyzeStreamingPattern(buffer, pattern) {
        const result = {
            detected: false,
            confidence: 0,
            startMarkers: 0,
            contentMatches: 0,
            endMarkers: 0
        };
        
        // Check start markers
        result.startMarkers = pattern.startMarkers.reduce((count, marker) => {
            return count + (buffer.includes(marker) ? 1 : 0);
        }, 0);
        
        // Check content patterns
        pattern.contentPatterns.forEach(regex => {
            const matches = buffer.match(regex);
            if (matches) {
                result.contentMatches += matches.length;
            }
        });
        
        // Check end markers
        result.endMarkers = pattern.endMarkers.reduce((count, marker) => {
            return count + (buffer.includes(marker) ? 1 : 0);
        }, 0);
        
        // Determine if AI streaming is detected
        if (result.startMarkers > 0 && result.contentMatches > 0) {
            result.detected = true;
            result.confidence = Math.min(
                pattern.confidence * (1 + result.contentMatches * 0.1),
                0.99
            );
        }
        
        return result;
    }
    
    /**
     * Monitor HTTP response for streaming patterns
     */
    monitorHTTPResponse(response, siteUrl, requestUrl) {
        const contentType = response.headers['content-type'] || '';
        
        // Check if this might be a streaming response
        if (contentType.includes('text/event-stream') || 
            contentType.includes('application/x-ndjson') ||
            contentType.includes('text/plain')) {
            
            return this.monitorSSE(response, siteUrl, requestUrl);
        }
        
        return null;
    }
    
    /**
     * Finalize stream analysis
     */
    finalizeStream(streamId) {
        const stream = this.activeStreams.get(streamId);
        if (!stream) return;
        
        const duration = Date.now() - stream.startTime;
        
        this.emit('streamComplete', {
            streamId,
            siteUrl: stream.siteUrl,
            type: stream.type,
            duration,
            aiDetected: stream.aiDetected,
            messageCount: stream.messageCount || 0,
            chunkCount: stream.chunkCount || 0
        });
        
        if (stream.aiDetected) {
            console.log(`✅ AI streaming session completed on ${stream.siteUrl} (${duration}ms)`);
        }
        
        this.activeStreams.delete(streamId);
    }
    
    /**
     * Get active streams summary
     */
    getActiveStreamsSummary() {
        const summary = {
            totalStreams: this.activeStreams.size,
            aiStreams: 0,
            streamTypes: { websocket: 0, sse: 0 },
            sites: new Set()
        };
        
        for (const stream of this.activeStreams.values()) {
            if (stream.aiDetected) summary.aiStreams++;
            summary.streamTypes[stream.type]++;
            summary.sites.add(stream.siteUrl);
        }
        
        summary.uniqueSites = summary.sites.size;
        return summary;
    }
    
    /**
     * Enhanced pattern matching for real-time detection
     */
    enhancePatternMatching(newPatterns) {
        Object.assign(this.streamPatterns, newPatterns);
        console.log(`Enhanced streaming patterns with ${Object.keys(newPatterns).length} new patterns`);
    }
    
    /**
     * Export streaming detection logs
     */
    exportStreamingLogs(filePath) {
        const fs = require('fs');
        const logs = {
            timestamp: new Date().toISOString(),
            activeStreams: Array.from(this.activeStreams.entries()),
            summary: this.getActiveStreamsSummary(),
            patterns: Object.keys(this.streamPatterns)
        };
        
        fs.writeFileSync(filePath, JSON.stringify(logs, null, 2));
        console.log(`Streaming detection logs exported to: ${filePath}`);
    }
}

module.exports = { StreamingAIDetector };
