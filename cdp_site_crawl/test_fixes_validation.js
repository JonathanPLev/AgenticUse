#!/usr/bin/env node

/**
 * Validation test for all implemented fixes
 * Tests without browser launch to validate code fixes
 */

const fs = require('fs');
const path = require('path');

// Import modules to test
const { performGenericDetection } = require('./generic_detection');
const { isConsentOMaticActive } = require('./consent_handler');
const { enhancedInputInteraction } = require('./enhanced_input_interaction');

console.log('🔧 VALIDATING ALL IMPLEMENTED FIXES');
console.log('===================================');
console.log('Testing:');
console.log('  ✅ Regex pattern serialization fixes');
console.log('  ✅ Consent-O-Matic function export');
console.log('  ✅ Generic detection module integrity');
console.log('  ✅ Enhanced input interaction limits');
console.log('  ✅ Module imports and exports\n');

async function validateFixes() {
  const results = {
    regexPatternFix: false,
    consentFunctionExport: false,
    genericDetectionIntegrity: false,
    inputInteractionLimits: false,
    moduleImports: false,
    allTestsPassed: false
  };

  try {
    // Test 1: Validate regex pattern fixes in generic_detection.js
    console.log('🧪 Test 1: Regex Pattern Serialization Fix');
    const genericDetectionContent = fs.readFileSync(path.join(__dirname, 'generic_detection.js'), 'utf8');
    
    // Check that regex literals have been replaced with RegExp constructor
    const hasRegexLiterals = /\/[^\/\n]+\/[gimuy]*/.test(genericDetectionContent);
    const hasRegExpConstructor = /new RegExp\(/.test(genericDetectionContent);
    
    if (!hasRegexLiterals && hasRegExpConstructor) {
      console.log('  ✅ Regex patterns correctly use RegExp constructor');
      results.regexPatternFix = true;
    } else {
      console.log('  ❌ Regex patterns still use literals or missing RegExp constructor');
    }

    // Test 2: Validate consent function export
    console.log('\n🧪 Test 2: Consent-O-Matic Function Export');
    try {
      const consentHandler = require('./consent_handler');
      if (typeof consentHandler.isConsentOMaticActive === 'function') {
        console.log('  ✅ isConsentOMaticActive function properly exported');
        results.consentFunctionExport = true;
      } else {
        console.log('  ❌ isConsentOMaticActive function not exported');
      }
    } catch (error) {
      console.log(`  ❌ Error importing consent handler: ${error.message}`);
    }

    // Test 3: Validate generic detection module integrity
    console.log('\n🧪 Test 3: Generic Detection Module Integrity');
    try {
      const genericDetection = require('./generic_detection');
      if (typeof genericDetection.performGenericDetection === 'function') {
        console.log('  ✅ performGenericDetection function available');
        results.genericDetectionIntegrity = true;
      } else {
        console.log('  ❌ performGenericDetection function not available');
      }
    } catch (error) {
      console.log(`  ❌ Error importing generic detection: ${error.message}`);
    }

    // Test 4: Validate input interaction limits
    console.log('\n🧪 Test 4: Enhanced Input Interaction Limits');
    const inputInteractionContent = fs.readFileSync(path.join(__dirname, 'enhanced_input_interaction.js'), 'utf8');
    
    // Check for Infinity limit and proper condition handling
    const hasInfinityLimit = /maxInteractionsPerPage.*=.*Infinity/.test(inputInteractionContent);
    const hasProperCondition = /maxInteractionsPerPage.*!==.*Infinity/.test(inputInteractionContent) || 
                              /isFinite.*maxInteractionsPerPage/.test(inputInteractionContent);
    
    if (hasInfinityLimit) {
      console.log('  ✅ Interaction limit set to Infinity for production');
      results.inputInteractionLimits = true;
    } else {
      console.log('  ❌ Interaction limit not properly set to Infinity');
    }

    // Test 5: Validate all module imports work
    console.log('\n🧪 Test 5: Module Imports Validation');
    try {
      const botMitigation = require('./bot_mitigation');
      const instrumentation = require('./instrumentation');
      const interactionLogger = require('./interaction_logger');
      const staticData = require('./static_data_structs.cjs');
      
      console.log('  ✅ All core modules import successfully');
      results.moduleImports = true;
    } catch (error) {
      console.log(`  ❌ Error importing modules: ${error.message}`);
    }

    // Overall result
    const passedTests = Object.values(results).filter(Boolean).length - 1; // -1 for allTestsPassed
    const totalTests = Object.keys(results).length - 1; // -1 for allTestsPassed
    
    results.allTestsPassed = passedTests === totalTests;

    console.log('\n🎯 VALIDATION RESULTS');
    console.log('====================');
    console.log(`✅ Tests passed: ${passedTests}/${totalTests}`);
    console.log(`🔧 Regex pattern fix: ${results.regexPatternFix ? '✅' : '❌'}`);
    console.log(`🍪 Consent function export: ${results.consentFunctionExport ? '✅' : '❌'}`);
    console.log(`🔍 Generic detection integrity: ${results.genericDetectionIntegrity ? '✅' : '❌'}`);
    console.log(`🎯 Input interaction limits: ${results.inputInteractionLimits ? '✅' : '❌'}`);
    console.log(`📦 Module imports: ${results.moduleImports ? '✅' : '❌'}`);

    if (results.allTestsPassed) {
      console.log('\n🎉 ALL FIXES VALIDATED SUCCESSFULLY!');
      console.log('The crawler is ready for production testing.');
    } else {
      console.log('\n⚠️  Some fixes need attention. Check individual test results above.');
    }

    // Save validation report
    const report = {
      timestamp: new Date().toISOString(),
      testType: 'Fix Validation',
      results,
      summary: {
        totalTests,
        passedTests,
        successRate: `${Math.round((passedTests / totalTests) * 100)}%`
      }
    };

    fs.writeFileSync(
      path.join(__dirname, 'fix_validation_report.json'),
      JSON.stringify(report, null, 2)
    );

    console.log(`\n📁 Validation report saved to: fix_validation_report.json`);

    return results.allTestsPassed;

  } catch (error) {
    console.error('❌ Validation test failed:', error);
    return false;
  }
}

// Additional test: Validate specific fixes mentioned in the issue
async function validateSpecificIssues() {
  console.log('\n🎯 VALIDATING SPECIFIC REPORTED ISSUES');
  console.log('=====================================');

  // Issue 1: Check interaction limit removal
  console.log('📝 Issue 1: Interaction limit removal');
  const enhancedInputContent = fs.readFileSync(path.join(__dirname, 'enhanced_input_interaction.js'), 'utf8');
  if (enhancedInputContent.includes('maxInteractionsPerPage = Infinity')) {
    console.log('  ✅ FIXED: Interaction limit set to Infinity');
  } else {
    console.log('  ❌ NOT FIXED: Interaction limit still restricted');
  }

  // Issue 2: Check regex serialization fix
  console.log('\n📝 Issue 2: Regex serialization error');
  const genericDetectionContent = fs.readFileSync(path.join(__dirname, 'generic_detection.js'), 'utf8');
  if (genericDetectionContent.includes('new RegExp(') && !genericDetectionContent.includes('/search/i')) {
    console.log('  ✅ FIXED: Regex patterns use RegExp constructor');
  } else {
    console.log('  ❌ NOT FIXED: Regex patterns still use literals');
  }

  // Issue 3: Check consent function availability
  console.log('\n📝 Issue 3: isConsentOMaticActive function export');
  try {
    const { isConsentOMaticActive } = require('./consent_handler');
    if (typeof isConsentOMaticActive === 'function') {
      console.log('  ✅ FIXED: isConsentOMaticActive function properly exported');
    } else {
      console.log('  ❌ NOT FIXED: Function not available');
    }
  } catch (error) {
    console.log(`  ❌ NOT FIXED: ${error.message}`);
  }

  console.log('\n🎉 SPECIFIC ISSUE VALIDATION COMPLETE');
}

// Run validation if called directly
if (require.main === module) {
  validateFixes()
    .then(() => validateSpecificIssues())
    .catch(console.error);
}

module.exports = { validateFixes, validateSpecificIssues };
