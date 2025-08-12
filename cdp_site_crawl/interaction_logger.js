// interaction_logger.js
// Comprehensive logging system for all crawler interactions and results

const fs = require('fs');
const path = require('path');

class InteractionLogger {
  constructor(logDir) {
    this.logDir = logDir;
    this.ensureLogDirectory();
  }

  ensureLogDirectory() {
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }
  }

  /**
   * Log individual input interaction with detailed results
   */
  async logInputInteraction(data) {
    const logEntry = {
      timestamp: Date.now(),
      type: 'input_interaction',
      url: data.url,
      elementInfo: data.elementInfo,
      interactionResult: data.interactionResult,
      networkRequests: data.networkRequests || [],
      success: data.success,
      error: data.error || null,
      duration: data.duration,
      tabId: data.tabId
    };

    await this.writeToLog('input_interactions.log', logEntry);
    return logEntry;
  }

  /**
   * Log network request triggered by interaction
   */
  async logNetworkRequest(data) {
    const logEntry = {
      timestamp: Date.now(),
      type: 'network_request',
      url: data.url,
      method: data.method,
      headers: data.headers,
      postData: data.postData,
      responseStatus: data.responseStatus,
      responseHeaders: data.responseHeaders,
      responseBody: data.responseBody,
      triggeredBy: data.triggeredBy || 'unknown',
      interactionId: data.interactionId
    };

    await this.writeToLog('network_requests.log', logEntry);
    return logEntry;
  }

  /**
   * Log page-level interaction summary
   */
  async logPageSummary(data) {
    const logEntry = {
      timestamp: Date.now(),
      type: 'page_summary',
      url: data.url,
      totalElementsFound: data.totalElementsFound,
      totalInteractions: data.totalInteractions,
      successfulInteractions: data.successfulInteractions,
      failedInteractions: data.failedInteractions,
      totalNetworkRequests: data.totalNetworkRequests,
      uniqueEndpoints: data.uniqueEndpoints || [],
      detectedServices: data.detectedServices || [],
      crawlDuration: data.crawlDuration,
      botMitigationApplied: data.botMitigationApplied
    };

    await this.writeToLog('page_summaries.log', logEntry);
    return logEntry;
  }

  /**
   * Log detected AI/chatbot services
   */
  async logServiceDetection(data) {
    const logEntry = {
      timestamp: Date.now(),
      type: 'service_detection',
      url: data.url,
      serviceType: data.serviceType, // 'chatbot', 'search', 'ai_assistant', etc.
      serviceName: data.serviceName,
      detectionMethod: data.detectionMethod, // 'network', 'dom', 'interaction'
      confidence: data.confidence,
      evidence: data.evidence,
      interactionTriggered: data.interactionTriggered || false
    };

    await this.writeToLog('service_detections.log', logEntry);
    return logEntry;
  }

  /**
   * Log errors and warnings
   */
  async logError(data) {
    const logEntry = {
      timestamp: Date.now(),
      type: 'error',
      url: data.url,
      errorType: data.errorType,
      errorMessage: data.errorMessage,
      stackTrace: data.stackTrace,
      context: data.context
    };

    await this.writeToLog('errors.log', logEntry);
    return logEntry;
  }

  /**
   * Write log entry to specified file
   */
  async writeToLog(filename, logEntry) {
    try {
      const logPath = path.join(this.logDir, filename);
      const logLine = JSON.stringify(logEntry) + '\n';
      await fs.promises.appendFile(logPath, logLine);
    } catch (error) {
      console.error(`Failed to write to log ${filename}:`, error.message);
    }
  }

  /**
   * Generate comprehensive crawl report
   */
  async generateCrawlReport(data) {
    const report = {
      timestamp: Date.now(),
      type: 'crawl_report',
      url: data.url,
      crawlStartTime: data.crawlStartTime,
      crawlEndTime: Date.now(),
      totalDuration: Date.now() - data.crawlStartTime,
      
      // Input interaction stats
      inputInteractions: {
        total: data.totalInteractions || 0,
        successful: data.successfulInteractions || 0,
        failed: data.failedInteractions || 0,
        elementTypes: data.elementTypes || {},
        testInputsUsed: data.testInputsUsed || []
      },

      // Network activity stats
      networkActivity: {
        totalRequests: data.totalNetworkRequests || 0,
        uniqueEndpoints: data.uniqueEndpoints || [],
        methodBreakdown: data.methodBreakdown || {},
        suspiciousRequests: data.suspiciousRequests || []
      },

      // Service detection results
      detectedServices: data.detectedServices || [],
      
      // Bot mitigation applied
      botMitigation: {
        applied: data.botMitigationApplied || false,
        techniques: data.mitigationTechniques || []
      },

      // Errors encountered
      errors: data.errors || [],
      
      // Files generated
      logFiles: data.logFiles || []
    };

    await this.writeToLog('crawl_reports.log', report);
    
    // Also write a human-readable summary
    await this.writeHumanReadableReport(report);
    
    return report;
  }

  /**
   * Write human-readable crawl report
   */
  async writeHumanReadableReport(report) {
    const reportPath = path.join(this.logDir, 'crawl_summary.txt');
    
    const summary = `
CRAWLER REPORT - ${new Date(report.timestamp).toISOString()}
================================================================

URL: ${report.url}
Crawl Duration: ${Math.round(report.totalDuration / 1000)}s
Start Time: ${new Date(report.crawlStartTime).toISOString()}
End Time: ${new Date(report.crawlEndTime).toISOString()}

INPUT INTERACTIONS
------------------
Total Interactions: ${report.inputInteractions.total}
Successful: ${report.inputInteractions.successful}
Failed: ${report.inputInteractions.failed}
Success Rate: ${report.inputInteractions.total > 0 ? Math.round((report.inputInteractions.successful / report.inputInteractions.total) * 100) : 0}%

Element Types Interacted With:
${Object.entries(report.inputInteractions.elementTypes).map(([type, count]) => `  - ${type}: ${count}`).join('\n')}

NETWORK ACTIVITY
----------------
Total Network Requests: ${report.networkActivity.totalRequests}
Unique Endpoints: ${report.networkActivity.uniqueEndpoints.length}
HTTP Methods Used: ${Object.entries(report.networkActivity.methodBreakdown).map(([method, count]) => `${method}(${count})`).join(', ')}

DETECTED SERVICES
-----------------
${report.detectedServices.length > 0 ? 
  report.detectedServices.map(service => `- ${service.serviceName} (${service.serviceType}) - Confidence: ${service.confidence}`).join('\n') :
  'No AI/chatbot services detected'
}

BOT MITIGATION
--------------
Applied: ${report.botMitigation.applied ? 'Yes' : 'No'}
Techniques: ${report.botMitigation.techniques.join(', ')}

ERRORS
------
${report.errors.length > 0 ? 
  report.errors.map(error => `- ${error.errorType}: ${error.errorMessage}`).join('\n') :
  'No errors encountered'
}

LOG FILES GENERATED
-------------------
${report.logFiles.map(file => `- ${file}`).join('\n')}

================================================================
`;

    try {
      await fs.promises.writeFile(reportPath, summary);
    } catch (error) {
      console.error('Failed to write human-readable report:', error.message);
    }
  }
}

module.exports = { InteractionLogger };
