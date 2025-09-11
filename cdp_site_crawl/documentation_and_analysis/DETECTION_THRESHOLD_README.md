# AI Detection Threshold and Quantification System

## Overview

This document explains how AI detection thresholds are calculated, what the quantification metrics mean, and how to interpret and adjust the detection system for optimal accuracy.

## Detection Threshold Formula

### Primary Detection Criteria
A site is classified as "AI Detected" when **BOTH** conditions are met:
1. **Confidence Score** ≥ 30%
2. **AI Usage Score** ≥ 10 points

### Confidence Score Calculation

```
Base Confidence = Σ(Evidence Confidence × Evidence Weight) / Σ(Evidence Weights)

Final Confidence = Base Confidence × Context Multiplier

Context Multipliers:
- Real Usage Context: ×1.3 (boost)
- News Context: ×0.4 (reduce)
- Educational Context: ×0.6 (reduce)
- Marketing Context: ×0.8 (slight reduce)
```

### Evidence Weights
| Evidence Type | Weight | Rationale |
|---------------|--------|-----------|
| AI Domain | 0.4 | Strong indicator of AI service usage |
| API Endpoint | 0.5 | Highest weight - direct API interaction |
| AI Response | 0.4 | Confirms successful AI service communication |
| Streaming Response | 0.5 | High confidence - real-time AI interaction |
| Function Call | 0.3 | Medium confidence - could be documentation |
| JS Library | 0.2 | Lower weight - might be unused import |
| Content Pattern | 0.1 | Lowest weight - high false positive risk |
| Chatbot Interaction | 0.3 | Medium confidence - detected interaction |
| Script Loading | 0.2 | Lower confidence - script might not execute |
| AI Header | 0.4 | High confidence - authentication present |

## AI Usage Score Formula

The AI Usage Score quantifies the intensity and breadth of AI usage on a scale of 0-100:

```
Base Score = (API Calls × 25) + 
             (Unique AI Domains × 15) + 
             (Function Calls × 10) + 
             (Streaming Indicators × 20) + 
             (JS Libraries × 8) + 
             (Content Matches × 2)

Context-Adjusted Score = Base Score × Context Multiplier

Context Multipliers:
- Real Usage Context: ×1.5 (significant boost)
- News/Educational Context: ×0.3 (major reduction)

Final Score = min(Context-Adjusted Score, 100)
```

### Score Interpretation
| Score Range | Interpretation | Typical Characteristics |
|-------------|----------------|------------------------|
| 0-10 | No/Minimal AI | Content mentions only, no technical implementation |
| 11-25 | Light AI Usage | Single API calls, basic integration |
| 26-50 | Moderate AI Usage | Multiple API calls, some streaming, basic chatbots |
| 51-75 | Heavy AI Usage | Multiple AI services, streaming, complex integration |
| 76-100 | Intensive AI Usage | Comprehensive AI integration, multiple domains, real-time features |

## False Positive Risk Assessment

### Risk Calculation
```
Base Risk = 0

Risk Factors:
+ 0.4 if (Content Evidence > Technical Evidence × 2)
+ 0.3 if News Context detected
+ 0.2 if Educational Context detected
+ 0.1 if Marketing Context detected

Risk Reduction:
× 0.3 if Real Usage Context detected

Final Risk = min(Base Risk, 1.0) × 100
```

### Risk Interpretation
| Risk Level | Percentage | Action Required |
|------------|------------|-----------------|
| Low | 0-25% | Accept detection as valid |
| Medium | 26-50% | Review evidence quality |
| High | 51-75% | Manual review recommended |
| Very High | 76-100% | Manual review required |

## Context Analysis System

### Real Usage Indicators (High Confidence)
- `api key`, `authentication`, `bearer token`
- `authorization`, `request payload`, `response data`
- `function call`, `method invocation`, `sdk`
- `library import`, `client initialization`

### False Positive Indicators

#### News Context
- `news`, `article`, `story`, `report`, `journalism`
- `breaking`, `headline`, `reuters`, `associated press`
- Major news outlets: `cnn`, `bbc`, `nytimes`

#### Educational Context
- `learn`, `tutorial`, `course`, `education`, `study`
- `research`, `academic`, `university`, `school`
- `definition`, `explanation`

#### Marketing Context
- `advertisement`, `ad`, `promote`, `marketing`
- `sale`, `discount`, `offer`, `deal`, `campaign`

## Threshold Adjustment Guidelines

### Increasing Detection Sensitivity
To catch more AI usage (higher recall, more false positives):

```javascript
const sensitiveConfig = {
    confidenceThreshold: 20,    // Lower from 30
    usageScoreThreshold: 5,     // Lower from 10
    contextMultipliers: {
        news: 0.6,              // Increase from 0.4
        educational: 0.8        // Increase from 0.6
    }
};
```

### Increasing Detection Precision
To reduce false positives (lower recall, higher precision):

```javascript
const preciseConfig = {
    confidenceThreshold: 50,    // Increase from 30
    usageScoreThreshold: 20,    // Increase from 10
    contextMultipliers: {
        news: 0.2,              // Decrease from 0.4
        educational: 0.4        // Decrease from 0.6
    }
};
```

### Domain-Specific Adjustments

#### News Sites
```javascript
const newsConfig = {
    confidenceThreshold: 60,    // Higher threshold
    usageScoreThreshold: 30,    // Require strong technical evidence
    evidenceWeights: {
        content_pattern: 0.05,  // Reduce content weight
        api_endpoint: 0.6       // Increase technical weight
    }
};
```

#### Tech/AI Companies
```javascript
const techConfig = {
    confidenceThreshold: 25,    // Lower threshold
    usageScoreThreshold: 8,     // Lower usage requirement
    contextMultipliers: {
        educational: 0.8        // Less penalty for educational content
    }
};
```

## Quantification Metrics Explained

### API Call Count
- **Definition**: Number of detected requests to AI service domains
- **High Value Threshold**: >5 calls
- **Interpretation**: Direct measure of AI service usage intensity

### Unique AI Domains
- **Definition**: Number of different AI service providers detected
- **High Value Threshold**: >2 domains
- **Interpretation**: Indicates breadth of AI integration

### Function Call Count
- **Definition**: Number of AI-related JavaScript function calls detected
- **High Value Threshold**: >3 calls
- **Interpretation**: Measure of code-level AI integration

### Streaming Indicators
- **Definition**: Number of detected real-time AI interactions (WebSocket, SSE)
- **High Value Threshold**: >1 indicator
- **Interpretation**: Indicates advanced, real-time AI features

### JS Library Count
- **Definition**: Number of AI-related JavaScript libraries detected
- **High Value Threshold**: >2 libraries
- **Interpretation**: Shows development-level AI integration

### Content Matches
- **Definition**: Number of AI-related terms found in page content
- **High Value Threshold**: >10 matches
- **Interpretation**: Could indicate AI focus or just AI-related content

## Calibration and Validation

### Manual Validation Process
1. **High-Confidence Detections** (>70%): Spot check 10% for accuracy
2. **Medium-Confidence Detections** (30-70%): Review 25% manually
3. **High False Positive Risk** (>50%): Review 100% manually

### Threshold Optimization
Based on manual validation results:

```
Optimal Confidence Threshold = Threshold where (Precision × Recall) is maximized

Target Metrics:
- Precision: >90% (minimize false positives)
- Recall: >80% (catch most AI usage)
- F1 Score: >85% (balanced performance)
```

### A/B Testing Framework
```javascript
// Test different threshold configurations
const configs = [
    { confidence: 30, usage: 10, name: 'default' },
    { confidence: 40, usage: 15, name: 'conservative' },
    { confidence: 25, usage: 8, name: 'aggressive' }
];

// Compare results across configurations
for (const config of configs) {
    const results = await runDetectionWithConfig(config);
    console.log(`${config.name}: ${results.precision}% precision, ${results.recall}% recall`);
}
```

## Real-World Examples

### High-Confidence Detection (mail.ru - 58%)
```json
{
    "evidence": [
        {"type": "ai_domain", "confidence": 0.9, "details": "api.openai.com"},
        {"type": "api_endpoint", "confidence": 0.95, "details": "/v1/chat/completions"},
        {"type": "function_call", "confidence": 0.8, "details": "openai.chat.completions.create"}
    ],
    "contextAnalysis": {"realUsageContext": true},
    "aiUsageScore": 67,
    "falsePositiveRisk": 15
}
```

### False Positive Example (CNN news about AI)
```json
{
    "evidence": [
        {"type": "content_pattern", "confidence": 0.3, "details": "artificial intelligence"},
        {"type": "content_pattern", "confidence": 0.3, "details": "machine learning"}
    ],
    "contextAnalysis": {"newsContext": true},
    "aiUsageScore": 8,
    "falsePositiveRisk": 85
}
```

## Monitoring and Alerts

### Threshold Performance Monitoring
```javascript
// Monitor detection quality over time
const qualityMetrics = {
    falsePositiveRate: calculateFPRate(),
    falseNegativeRate: calculateFNRate(),
    averageConfidence: calculateAvgConfidence(),
    thresholdEffectiveness: calculateThresholdPerformance()
};

// Alert if quality degrades
if (qualityMetrics.falsePositiveRate > 0.1) {
    console.warn('High false positive rate detected - consider raising thresholds');
}
```

### Automatic Threshold Adjustment
```javascript
// Automatically adjust thresholds based on validation feedback
function adjustThresholds(validationResults) {
    if (validationResults.precision < 0.9) {
        config.confidenceThreshold += 5;
        config.usageScoreThreshold += 2;
    }
    
    if (validationResults.recall < 0.8) {
        config.confidenceThreshold -= 3;
        config.usageScoreThreshold -= 1;
    }
}
```

---

**Note**: These thresholds are calibrated based on analysis of 16 diverse websites. For different domains or use cases, manual calibration may be required to achieve optimal precision-recall balance.
