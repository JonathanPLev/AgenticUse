# Machine Learning System for Offline AI Detection

## Overview

The ML system enhances AI detection accuracy by learning patterns from successful detections and reducing false positives through adaptive pattern recognition.

## Core Components

### 1. Pattern Learning Engine (`ml_ai_pattern_learner.js`)
- **Automatic Discovery**: Learns new AI patterns from detection results
- **Frequency Analysis**: Weights patterns based on occurrence and confidence
- **False Positive Reduction**: Adjusts weights based on feedback

### 2. Offline Integration
- **Post-crawl Analysis**: Trains on completed detection results
- **Model Persistence**: Saves/loads trained models between sessions
- **Incremental Learning**: Updates existing models with new data

## Usage Instructions

### Basic Operation

```javascript
const { MLAIPatternLearner } = require('./ml_ai_pattern_learner');
const { OfflineAIRunner } = require('./offline_ai_runner');

// Initialize ML system
const mlLearner = new MLAIPatternLearner();

// Load existing model (if available)
mlLearner.loadModel('./ai_detection_model.json');

// Run detection and collect results
const runner = new OfflineAIRunner();
const results = await runner.runDetection();

// Train ML model on results
const aiDetections = results.detailedResults.filter(r => r.aiDetected);
mlLearner.trainOnDetectionResults(aiDetections);

// Export updated model
mlLearner.exportModel('./ai_detection_model.json');
```

### Training Process

The ML system learns from four types of patterns:

1. **Domain Patterns**: AI service domains from successful detections
2. **URL Patterns**: API endpoint paths and parameters
3. **Content Patterns**: AI-related terms and phrases in context
4. **Function Patterns**: JavaScript function calls and method chains

### Pattern Weighting Formula

```
Pattern Weight = Base Confidence × (1 + log(Frequency) / 10)
```

Where:
- **Base Confidence**: Average confidence of detections containing this pattern
- **Frequency**: Number of times pattern appeared in successful detections
- **Maximum Weight**: Capped at 0.95 to prevent overconfidence

### Learning Thresholds

- **Minimum Confidence for Training**: 0.6 (60%)
- **Minimum Pattern Frequency**: 2 occurrences
- **False Positive Weight Reduction**: 10% per false positive report

## Model Management

### Exporting Models

```javascript
// Export current model state
const model = mlLearner.exportModel('./my_model.json');

console.log(`Model contains ${model.learnedPatterns.size} patterns`);
```

### Loading Models

```javascript
// Load previously trained model
const success = mlLearner.loadModel('./my_model.json');

if (success) {
    console.log('Model loaded successfully');
} else {
    console.log('Starting with fresh model');
}
```

### Model Statistics

```javascript
const stats = mlLearner.getModelStats();

console.log(`Learned Patterns: ${stats.learnedPatterns}`);
console.log(`Training Data Points: ${stats.trainingDataPoints}`);
console.log(`Estimated Accuracy: ${(stats.accuracy * 100).toFixed(1)}%`);
```

## Pattern Types

### 1. Domain Patterns
- **Example**: `api.openai.com`, `api.anthropic.com`
- **Weight**: High (0.8-0.95)
- **Usage**: Direct domain matching in network requests

### 2. URL Path Patterns
- **Example**: `/v1/chat/completions`, `/generate`
- **Weight**: High (0.8-0.9)
- **Usage**: API endpoint detection

### 3. Content Patterns
- **Example**: AI-related terms in technical context
- **Weight**: Medium (0.4-0.7)
- **Usage**: Content analysis with context filtering

### 4. Function Patterns
- **Example**: `openai.chat.completions.create`
- **Weight**: Medium-High (0.6-0.8)
- **Usage**: JavaScript function call detection

## False Positive Handling

### Automatic Adjustment
```javascript
// Mark detection as false positive
mlLearner.markFalsePositive(detectionId, 'news article about AI');

// System automatically reduces related pattern weights
```

### Context-Aware Learning
The system distinguishes between:
- **Real Usage**: API calls, authentication, technical implementation
- **Content Mentions**: News articles, educational content, marketing

### Confidence Adjustment
- **Real Usage Context**: +30% confidence boost
- **News Context**: -60% confidence reduction
- **Educational Context**: -40% confidence reduction

## Performance Optimization

### Training Efficiency
- **Batch Processing**: Train on multiple results simultaneously
- **Incremental Updates**: Add new patterns without retraining entire model
- **Memory Management**: Automatic cleanup of low-value patterns

### Pattern Pruning
- Remove patterns with frequency < 2 after 100 training sessions
- Reduce weights of patterns associated with false positives
- Merge similar patterns to reduce model complexity

## Integration with Offline Detection

### Automatic Integration
```javascript
const runner = new OfflineAIRunner({
    enableML: true,  // Enable ML enhancement
    mlModelPath: './ai_detection_model.json'
});

// ML predictions automatically included in detection results
const results = await runner.runDetection();
```

### Manual Integration
```javascript
// Get ML prediction for specific features
const features = {
    url: 'https://api.example.com/chat',
    content: 'function callAI() { ... }',
    functions: ['openai.chat.completions.create']
};

const prediction = mlLearner.predictAIProbability(features);
console.log(`ML Confidence: ${(prediction.probability * 100).toFixed(1)}%`);
```

## Model Evolution

### Version Tracking
- Models include version numbers and timestamps
- Backward compatibility maintained across versions
- Migration tools for upgrading old models

### Performance Metrics
- **Accuracy**: Percentage of correct predictions
- **Precision**: True positives / (True positives + False positives)
- **Recall**: True positives / (True positives + False negatives)

### Expected Improvements
With sufficient training data (100+ sites):
- **Detection Accuracy**: 85-95%
- **False Positive Rate**: <5%
- **New Pattern Discovery**: 10-20 new patterns per 100 sites

## Troubleshooting

### Common Issues

1. **Low Learning Rate**
   - **Cause**: Insufficient high-confidence detections
   - **Solution**: Lower confidence threshold or increase training data

2. **High False Positive Rate**
   - **Cause**: Overfitting to content patterns
   - **Solution**: Increase technical pattern weights, improve context analysis

3. **Model Not Loading**
   - **Cause**: Corrupted or incompatible model file
   - **Solution**: Delete model file to start fresh, check file permissions

### Debug Mode
```javascript
// Enable detailed logging
const mlLearner = new MLAIPatternLearner({ debug: true });

// View pattern learning process
mlLearner.on('patternLearned', (pattern) => {
    console.log(`Learned: ${pattern.type}:${pattern.value} (weight: ${pattern.weight})`);
});
```

## Best Practices

### Training Data Quality
- Use only high-confidence detections (>60%) for training
- Manually review and mark false positives
- Balance training data across different AI categories

### Model Maintenance
- Retrain models monthly with new detection data
- Monitor false positive rates and adjust thresholds
- Archive old models before major updates

### Performance Monitoring
- Track model accuracy over time
- Monitor pattern distribution and weights
- Analyze prediction confidence distributions

## Advanced Features

### Custom Pattern Types
```javascript
// Add custom pattern type
mlLearner.addPatternType('custom_header', {
    extractionFunction: (logEntry) => extractCustomHeaders(logEntry),
    weightFunction: (frequency, confidence) => confidence * 0.8,
    confidenceThreshold: 0.7
});
```

### Ensemble Learning
```javascript
// Combine multiple models
const ensemble = new MLEnsemble([model1, model2, model3]);
const prediction = ensemble.predict(features);
```

### Real-time Learning
```javascript
// Update model with new detection immediately
mlLearner.incrementalUpdate(newDetection);
```

---

**Note**: The ML system is designed for offline analysis and does not require real-time processing capabilities. All learning occurs post-crawl for optimal accuracy and resource efficiency.
