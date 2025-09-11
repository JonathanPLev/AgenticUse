// ai_detection_database.js
// Database storage system for AI detection results with SQLite backend

const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

class AIDetectionDatabase {
    constructor(dbPath = './ai_detections.db') {
        this.dbPath = dbPath;
        this.db = null;
        this.initializeDatabase();
    }
    
    /**
     * Initialize SQLite database with required tables
     */
    initializeDatabase() {
        this.db = new sqlite3.Database(this.dbPath, (err) => {
            if (err) {
                console.error('Error opening database:', err.message);
                return;
            }
            console.log(`📊 Connected to AI detection database: ${this.dbPath}`);
        });
        
        this.createTables();
    }
    
    /**
     * Create database tables
     */
    createTables() {
        const tables = [
            // Main detection results table
            `CREATE TABLE IF NOT EXISTS detections (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                site_url TEXT NOT NULL,
                ai_detected BOOLEAN NOT NULL,
                confidence INTEGER NOT NULL,
                categories TEXT,
                evidence_count INTEGER DEFAULT 0,
                detection_timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
                crawler_session TEXT,
                INDEX(site_url),
                INDEX(detection_timestamp)
            )`,
            
            // Evidence details table
            `CREATE TABLE IF NOT EXISTS evidence (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                detection_id INTEGER,
                evidence_type TEXT NOT NULL,
                evidence_data TEXT,
                confidence REAL,
                timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY(detection_id) REFERENCES detections(id)
            )`,
            
            // Streaming detections table
            `CREATE TABLE IF NOT EXISTS streaming_detections (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                site_url TEXT NOT NULL,
                stream_type TEXT NOT NULL,
                stream_id TEXT,
                pattern_name TEXT,
                confidence REAL,
                duration_ms INTEGER,
                message_count INTEGER DEFAULT 0,
                detection_timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
                INDEX(site_url),
                INDEX(stream_type)
            )`,
            
            // Pattern learning table
            `CREATE TABLE IF NOT EXISTS learned_patterns (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                pattern_type TEXT NOT NULL,
                pattern_value TEXT NOT NULL,
                weight REAL NOT NULL,
                frequency INTEGER DEFAULT 1,
                avg_confidence REAL,
                learned_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                last_seen DATETIME DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(pattern_type, pattern_value)
            )`,
            
            // False positives tracking
            `CREATE TABLE IF NOT EXISTS false_positives (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                detection_id INTEGER,
                reason TEXT,
                marked_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY(detection_id) REFERENCES detections(id)
            )`,
            
            // Site crawl sessions
            `CREATE TABLE IF NOT EXISTS crawl_sessions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id TEXT UNIQUE NOT NULL,
                start_time DATETIME DEFAULT CURRENT_TIMESTAMP,
                end_time DATETIME,
                total_sites INTEGER DEFAULT 0,
                sites_with_ai INTEGER DEFAULT 0,
                total_detections INTEGER DEFAULT 0,
                crawler_version TEXT
            )`
        ];
        
        tables.forEach(sql => {
            this.db.run(sql, (err) => {
                if (err) {
                    console.error('Error creating table:', err.message);
                }
            });
        });
    }
    
    /**
     * Store detection result
     */
    async storeDetection(detectionResult, sessionId = null) {
        return new Promise((resolve, reject) => {
            const stmt = this.db.prepare(`
                INSERT INTO detections (
                    site_url, ai_detected, confidence, categories, 
                    evidence_count, crawler_session
                ) VALUES (?, ?, ?, ?, ?, ?)
            `);
            
            const categories = Array.isArray(detectionResult.categories) 
                ? detectionResult.categories.join(',') 
                : detectionResult.categories || '';
            
            stmt.run([
                detectionResult.site,
                detectionResult.aiDetected ? 1 : 0,
                detectionResult.confidence,
                categories,
                detectionResult.evidence ? detectionResult.evidence.length : 0,
                sessionId
            ], function(err) {
                if (err) {
                    reject(err);
                    return;
                }
                
                const detectionId = this.lastID;
                
                // Store evidence details
                if (detectionResult.evidence && detectionResult.evidence.length > 0) {
                    detectionResult.evidence.forEach(evidence => {
                        stmt.db.run(`
                            INSERT INTO evidence (
                                detection_id, evidence_type, evidence_data, confidence
                            ) VALUES (?, ?, ?, ?)
                        `, [
                            detectionId,
                            evidence.type,
                            JSON.stringify(evidence),
                            evidence.confidence || 0
                        ]);
                    });
                }
                
                resolve(detectionId);
            });
            
            stmt.finalize();
        });
    }
    
    /**
     * Store streaming detection
     */
    async storeStreamingDetection(streamingData) {
        return new Promise((resolve, reject) => {
            const stmt = this.db.prepare(`
                INSERT INTO streaming_detections (
                    site_url, stream_type, stream_id, pattern_name,
                    confidence, duration_ms, message_count
                ) VALUES (?, ?, ?, ?, ?, ?, ?)
            `);
            
            stmt.run([
                streamingData.siteUrl,
                streamingData.type,
                streamingData.streamId,
                streamingData.pattern || null,
                streamingData.confidence || 0,
                streamingData.duration || 0,
                streamingData.messageCount || 0
            ], function(err) {
                if (err) {
                    reject(err);
                    return;
                }
                resolve(this.lastID);
            });
            
            stmt.finalize();
        });
    }
    
    /**
     * Store learned pattern
     */
    async storeLearnedPattern(patternType, patternValue, weight, frequency, avgConfidence) {
        return new Promise((resolve, reject) => {
            const stmt = this.db.prepare(`
                INSERT OR REPLACE INTO learned_patterns (
                    pattern_type, pattern_value, weight, frequency, 
                    avg_confidence, last_seen
                ) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
            `);
            
            stmt.run([
                patternType, patternValue, weight, frequency, avgConfidence
            ], function(err) {
                if (err) {
                    reject(err);
                    return;
                }
                resolve(this.lastID);
            });
            
            stmt.finalize();
        });
    }
    
    /**
     * Create new crawl session
     */
    async createCrawlSession(sessionId, crawlerVersion = '1.0.0') {
        return new Promise((resolve, reject) => {
            const stmt = this.db.prepare(`
                INSERT INTO crawl_sessions (session_id, crawler_version)
                VALUES (?, ?)
            `);
            
            stmt.run([sessionId, crawlerVersion], function(err) {
                if (err) {
                    reject(err);
                    return;
                }
                resolve(this.lastID);
            });
            
            stmt.finalize();
        });
    }
    
    /**
     * Update crawl session statistics
     */
    async updateCrawlSession(sessionId, stats) {
        return new Promise((resolve, reject) => {
            const stmt = this.db.prepare(`
                UPDATE crawl_sessions 
                SET end_time = CURRENT_TIMESTAMP,
                    total_sites = ?,
                    sites_with_ai = ?,
                    total_detections = ?
                WHERE session_id = ?
            `);
            
            stmt.run([
                stats.totalSites,
                stats.sitesWithAI,
                stats.totalDetections,
                sessionId
            ], function(err) {
                if (err) {
                    reject(err);
                    return;
                }
                resolve(this.changes);
            });
            
            stmt.finalize();
        });
    }
    
    /**
     * Get detection statistics
     */
    async getDetectionStats(timeRange = '24 HOURS') {
        return new Promise((resolve, reject) => {
            const query = `
                SELECT 
                    COUNT(*) as total_detections,
                    SUM(CASE WHEN ai_detected = 1 THEN 1 ELSE 0 END) as ai_detections,
                    AVG(CASE WHEN ai_detected = 1 THEN confidence ELSE NULL END) as avg_confidence,
                    COUNT(DISTINCT site_url) as unique_sites
                FROM detections 
                WHERE detection_timestamp >= datetime('now', '-${timeRange}')
            `;
            
            this.db.get(query, (err, row) => {
                if (err) {
                    reject(err);
                    return;
                }
                resolve(row);
            });
        });
    }
    
    /**
     * Get top AI sites by confidence
     */
    async getTopAISites(limit = 10) {
        return new Promise((resolve, reject) => {
            const query = `
                SELECT site_url, confidence, categories, evidence_count,
                       detection_timestamp
                FROM detections 
                WHERE ai_detected = 1
                ORDER BY confidence DESC, evidence_count DESC
                LIMIT ?
            `;
            
            this.db.all(query, [limit], (err, rows) => {
                if (err) {
                    reject(err);
                    return;
                }
                resolve(rows);
            });
        });
    }
    
    /**
     * Get detection trends over time
     */
    async getDetectionTrends(days = 7) {
        return new Promise((resolve, reject) => {
            const query = `
                SELECT 
                    DATE(detection_timestamp) as date,
                    COUNT(*) as total_detections,
                    SUM(CASE WHEN ai_detected = 1 THEN 1 ELSE 0 END) as ai_detections,
                    AVG(CASE WHEN ai_detected = 1 THEN confidence ELSE NULL END) as avg_confidence
                FROM detections 
                WHERE detection_timestamp >= datetime('now', '-${days} days')
                GROUP BY DATE(detection_timestamp)
                ORDER BY date
            `;
            
            this.db.all(query, (err, rows) => {
                if (err) {
                    reject(err);
                    return;
                }
                resolve(rows);
            });
        });
    }
    
    /**
     * Get category distribution
     */
    async getCategoryDistribution() {
        return new Promise((resolve, reject) => {
            const query = `
                SELECT categories, COUNT(*) as count
                FROM detections 
                WHERE ai_detected = 1 AND categories IS NOT NULL AND categories != ''
                GROUP BY categories
                ORDER BY count DESC
            `;
            
            this.db.all(query, (err, rows) => {
                if (err) {
                    reject(err);
                    return;
                }
                
                // Process categories (they're stored as comma-separated)
                const categoryCount = {};
                rows.forEach(row => {
                    const categories = row.categories.split(',');
                    categories.forEach(category => {
                        const cat = category.trim();
                        if (cat) {
                            categoryCount[cat] = (categoryCount[cat] || 0) + row.count;
                        }
                    });
                });
                
                resolve(categoryCount);
            });
        });
    }
    
    /**
     * Search detections
     */
    async searchDetections(filters = {}) {
        return new Promise((resolve, reject) => {
            let query = 'SELECT * FROM detections WHERE 1=1';
            const params = [];
            
            if (filters.siteUrl) {
                query += ' AND site_url LIKE ?';
                params.push(`%${filters.siteUrl}%`);
            }
            
            if (filters.aiDetected !== undefined) {
                query += ' AND ai_detected = ?';
                params.push(filters.aiDetected ? 1 : 0);
            }
            
            if (filters.minConfidence) {
                query += ' AND confidence >= ?';
                params.push(filters.minConfidence);
            }
            
            if (filters.category) {
                query += ' AND categories LIKE ?';
                params.push(`%${filters.category}%`);
            }
            
            if (filters.timeRange) {
                query += ` AND detection_timestamp >= datetime('now', '-${filters.timeRange}')`;
            }
            
            query += ' ORDER BY detection_timestamp DESC';
            
            if (filters.limit) {
                query += ' LIMIT ?';
                params.push(filters.limit);
            }
            
            this.db.all(query, params, (err, rows) => {
                if (err) {
                    reject(err);
                    return;
                }
                resolve(rows);
            });
        });
    }
    
    /**
     * Export database to JSON
     */
    async exportToJSON(filePath) {
        const data = {
            detections: await this.getAllDetections(),
            streamingDetections: await this.getAllStreamingDetections(),
            learnedPatterns: await this.getAllLearnedPatterns(),
            crawlSessions: await this.getAllCrawlSessions(),
            exportTimestamp: new Date().toISOString()
        };
        
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
        console.log(`📤 Database exported to: ${filePath}`);
        
        return data;
    }
    
    /**
     * Get all detections
     */
    async getAllDetections() {
        return new Promise((resolve, reject) => {
            this.db.all('SELECT * FROM detections ORDER BY detection_timestamp DESC', (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
    }
    
    /**
     * Get all streaming detections
     */
    async getAllStreamingDetections() {
        return new Promise((resolve, reject) => {
            this.db.all('SELECT * FROM streaming_detections ORDER BY detection_timestamp DESC', (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
    }
    
    /**
     * Get all learned patterns
     */
    async getAllLearnedPatterns() {
        return new Promise((resolve, reject) => {
            this.db.all('SELECT * FROM learned_patterns ORDER BY weight DESC', (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
    }
    
    /**
     * Get all crawl sessions
     */
    async getAllCrawlSessions() {
        return new Promise((resolve, reject) => {
            this.db.all('SELECT * FROM crawl_sessions ORDER BY start_time DESC', (err, rows) => {
                if (err) reject(err);
                else resolve(rows);
            });
        });
    }
    
    /**
     * Close database connection
     */
    close() {
        if (this.db) {
            this.db.close((err) => {
                if (err) {
                    console.error('Error closing database:', err.message);
                } else {
                    console.log('📊 Database connection closed');
                }
            });
        }
    }
    
    /**
     * Get database statistics
     */
    async getDatabaseStats() {
        const stats = await Promise.all([
            this.getDetectionStats('7 DAYS'),
            this.getCategoryDistribution(),
            new Promise((resolve, reject) => {
                this.db.get('SELECT COUNT(*) as count FROM learned_patterns', (err, row) => {
                    if (err) reject(err);
                    else resolve(row.count);
                });
            })
        ]);
        
        return {
            detectionStats: stats[0],
            categoryDistribution: stats[1],
            learnedPatternsCount: stats[2],
            databaseSize: this.getDatabaseSize()
        };
    }
    
    /**
     * Get database file size
     */
    getDatabaseSize() {
        try {
            const stats = fs.statSync(this.dbPath);
            return {
                bytes: stats.size,
                mb: (stats.size / (1024 * 1024)).toFixed(2)
            };
        } catch (error) {
            return { bytes: 0, mb: '0.00' };
        }
    }
}

module.exports = { AIDetectionDatabase };
