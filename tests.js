/**
 * Test Suite for Period Tracker App
 * 
 * Usage:
 *   1. Open test.html in a browser
 *   2. Click "Run All Tests" button
 * 
 * Or run in browser console:
 *   1. Open the app in browser
 *   2. Open DevTools console
 *   3. Load tests.js and call runAllTests()
 */

// ============================================
// CLIENT-SIDE TESTS (run in browser console)
// ============================================

/**
 * Test: escapeHtml function
 * Edge cases: XSS attack vectors, null/undefined, special characters
 */
function testEscapeHtml() {
    const tests = [
        { input: '<script>alert("xss")</script>', expected: '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;' },
        { input: '"><img src=x onerror=alert(1)>', expected: '&quot;&gt;&lt;img src=x onerror=alert(1)&gt;' },
        { input: "Hello 'World'", expected: "Hello &#039;World&#039;" },
        { input: 'Normal text', expected: 'Normal text' },
        { input: '', expected: '' },
        { input: null, expected: '' },
        { input: undefined, expected: '' },
        { input: '&amp; already escaped', expected: '&amp;amp; already escaped' },
        { input: '<>&"\'', expected: '&lt;&gt;&amp;&quot;&#039;' },
    ];

    console.log('=== Testing escapeHtml ===');
    let passed = 0;
    tests.forEach((test, i) => {
        const result = escapeHtml(test.input);
        const success = result === test.expected;
        if (success) {
            passed++;
            console.log(`✅ Test ${i + 1}: PASS`);
        } else {
            console.log(`❌ Test ${i + 1}: FAIL`);
            console.log(`   Input: ${JSON.stringify(test.input)}`);
            console.log(`   Expected: ${test.expected}`);
            console.log(`   Got: ${result}`);
        }
    });
    console.log(`escapeHtml: ${passed}/${tests.length} tests passed\n`);
    return passed === tests.length;
}

/**
 * Test: displayEntries with edge cases
 * Edge cases: empty array, invalid entries, missing fields
 */
function testDisplayEntries() {
    console.log('=== Testing displayEntries edge cases ===');
    
    const originalContainer = entriesContainer.innerHTML;
    let passed = 0;
    const total = 5;

    // Test 1: Empty array
    displayEntries([]);
    if (entriesContainer.innerHTML.includes('No entries yet')) {
        console.log('✅ Test 1: Empty array shows empty state');
        passed++;
    } else {
        console.log('❌ Test 1: Empty array should show empty state');
    }

    // Test 2: Null/undefined entries in array
    displayEntries([null, undefined, { date: '2024-01-01', krvaceni: '1' }]);
    if (entriesContainer.querySelector('.entry-card')) {
        console.log('✅ Test 2: Filters out null/undefined entries');
        passed++;
    } else {
        console.log('❌ Test 2: Should filter out null/undefined and show valid entries');
    }

    // Test 3: Entries without date field
    displayEntries([{ krvaceni: '1' }, { nalady: '2' }]);
    if (entriesContainer.innerHTML.includes('Invalid data') || entriesContainer.innerHTML.includes('No entries')) {
        console.log('✅ Test 3: Entries without date are filtered');
        passed++;
    } else {
        console.log('❌ Test 3: Entries without date should be filtered out');
    }

    // Test 4: Entry with XSS in notes
    displayEntries([{ date: '2024-01-01', notes: '<script>alert("xss")</script>' }]);
    if (!entriesContainer.innerHTML.includes('<script>alert')) {
        console.log('✅ Test 4: XSS in notes is escaped');
        passed++;
    } else {
        console.log('❌ Test 4: XSS in notes should be escaped');
    }

    // Test 5: Entry with very long notes
    const longNotes = 'A'.repeat(10000);
    displayEntries([{ date: '2024-01-01', notes: longNotes }]);
    if (entriesContainer.querySelector('.entry-card')) {
        console.log('✅ Test 5: Handles very long notes');
        passed++;
    } else {
        console.log('❌ Test 5: Should handle very long notes');
    }

    // Restore
    entriesContainer.innerHTML = originalContainer;
    console.log(`displayEntries: ${passed}/${total} tests passed\n`);
    return passed === total;
}

/**
 * Test: calculatePeriodPrediction edge cases
 */
function testPeriodPrediction() {
    console.log('=== Testing calculatePeriodPrediction edge cases ===');
    
    const originalEntries = [...entries];
    let passed = 0;
    const total = 9;

    // Test 1: No entries
    entries = [];
    calculatePeriodPrediction();
    if (predictionInfoElement.textContent.includes('No data')) {
        console.log('✅ Test 1: No entries shows "No data available"');
        passed++;
    } else {
        console.log('❌ Test 1: No entries should show "No data available"');
    }

    // Test 2: Entries but no bleeding
    entries = [
        { date: '2024-01-01', krvaceni: '0', nalady: '2' },
        { date: '2024-01-02', krvaceni: '0', nalady: '1' }
    ];
    calculatePeriodPrediction();
    if (predictionInfoElement.textContent.includes('No period data')) {
        console.log('✅ Test 2: No bleeding shows "No period data found"');
        passed++;
    } else {
        console.log('❌ Test 2: No bleeding should show "No period data found"');
    }

    // Test 3: Only one period
    entries = [
        { date: '2024-01-01', krvaceni: '3' },
        { date: '2024-01-02', krvaceni: '2' },
        { date: '2024-01-03', krvaceni: '1' }
    ];
    calculatePeriodPrediction();
    if (predictionInfoElement.textContent.includes('Need more') || predictionDetailsElement.innerHTML.includes('Need at least 2')) {
        console.log('✅ Test 3: Single period shows "Need more cycle data"');
        passed++;
    } else {
        console.log('❌ Test 3: Single period should show "Need more cycle data"');
    }

    // Test 4: Two complete cycles (28-day cycle)
    entries = [
        { date: '2024-01-01', krvaceni: '3' },
        { date: '2024-01-02', krvaceni: '2' },
        { date: '2024-01-29', krvaceni: '3' },
        { date: '2024-01-30', krvaceni: '2' }
    ];
    calculatePeriodPrediction();
    if (predictionDetailsElement.innerHTML.includes('Average cycle: 28')) {
        console.log('✅ Test 4: Correctly calculates 28-day cycle');
        passed++;
    } else {
        console.log('❌ Test 4: Should calculate 28-day cycle');
        console.log('   Got:', predictionDetailsElement.innerHTML);
    }

    // Test 5: Irregular cycles (high variation warning)
    entries = [
        { date: '2024-01-01', krvaceni: '3' },
        { date: '2024-01-20', krvaceni: '3' }, // 19-day cycle
        { date: '2024-02-25', krvaceni: '3' }  // 36-day cycle
    ];
    calculatePeriodPrediction();
    if (predictionDetailsElement.innerHTML.includes('High cycle variation')) {
        console.log('✅ Test 5: Shows high variation warning');
        passed++;
    } else {
        console.log('❌ Test 5: Should show high variation warning for irregular cycles');
    }

    // Test 6: Out of order entries (should sort correctly)
    entries = [
        { date: '2024-02-25', krvaceni: '3' },
        { date: '2024-01-01', krvaceni: '3' },
        { date: '2024-01-29', krvaceni: '3' }
    ];
    calculatePeriodPrediction();
    if (predictionDetailsElement.innerHTML.includes('Average cycle')) {
        console.log('✅ Test 6: Handles out-of-order entries');
        passed++;
    } else {
        console.log('❌ Test 6: Should handle out-of-order entries');
    }

    // Test 7: Gap within same period (bleeding Jan 1 and Jan 5 = 4 day gap = same period)
    // User didn't log every day, but it's still the same period
    entries = [
        { date: '2024-01-01', krvaceni: '3' },  // Period 1 start
        { date: '2024-01-05', krvaceni: '2' },  // 4-day gap, still Period 1
        { date: '2024-01-29', krvaceni: '3' },  // Period 2 start (28 days from Jan 1)
        { date: '2024-02-02', krvaceni: '1' }   // 4-day gap, still Period 2
    ];
    calculatePeriodPrediction();
    // Should find 2 periods with 28-day cycle (not 4 periods)
    if (predictionDetailsElement.innerHTML.includes('2 periods')) {
        console.log('✅ Test 7: Groups bleeding with gaps as same period (4-day gap)');
        passed++;
    } else {
        console.log('❌ Test 7: Should group bleeding entries with small gaps as same period');
        console.log('   Got:', predictionDetailsElement.innerHTML);
    }

    // Test 8: Gap too large = separate periods (10-day gap)
    entries = [
        { date: '2024-01-01', krvaceni: '3' },  // Period 1
        { date: '2024-01-11', krvaceni: '3' },  // 10-day gap = Period 2 (too far)
        { date: '2024-02-08', krvaceni: '3' }   // Period 3
    ];
    calculatePeriodPrediction();
    // Should find 3 periods (gaps too large)
    if (predictionDetailsElement.innerHTML.includes('3 periods')) {
        console.log('✅ Test 8: Separates periods with large gaps (10+ days)');
        passed++;
    } else {
        console.log('❌ Test 8: Should separate periods with 10+ day gaps');
        console.log('   Got:', predictionDetailsElement.innerHTML);
    }

    // Test 9: Max gap boundary test (7-day gap = same period, 8-day gap = separate)
    entries = [
        { date: '2024-01-01', krvaceni: '3' },  // Period 1 start
        { date: '2024-01-08', krvaceni: '2' },  // 7-day gap = still Period 1
        { date: '2024-01-29', krvaceni: '3' }   // Period 2 start
    ];
    calculatePeriodPrediction();
    if (predictionDetailsElement.innerHTML.includes('2 periods')) {
        console.log('✅ Test 9: 7-day gap is within same period tolerance');
        passed++;
    } else {
        console.log('❌ Test 9: 7-day gap should be same period');
        console.log('   Got:', predictionDetailsElement.innerHTML);
    }

    // Restore
    entries = originalEntries;
    calculatePeriodPrediction();
    console.log(`calculatePeriodPrediction: ${passed}/${total} tests passed\n`);
    return passed === total;
}

/**
 * Test: Date validation edge cases
 */
function testDateValidation() {
    console.log('=== Testing Date Validation ===');
    
    const tests = [
        { date: '2024-01-01', valid: true, desc: 'Valid ISO date' },
        { date: '2024-12-31', valid: true, desc: 'End of year' },
        { date: '2024-02-29', valid: true, desc: 'Leap year Feb 29' },
        { date: '2023-02-29', valid: false, desc: 'Non-leap year Feb 29' },
        { date: '2024-13-01', valid: false, desc: 'Invalid month 13' },
        { date: '2024-00-01', valid: false, desc: 'Invalid month 0' },
        { date: '2024-01-32', valid: false, desc: 'Invalid day 32' },
        { date: '', valid: false, desc: 'Empty string' },
        { date: 'not-a-date', valid: false, desc: 'Invalid format' },
    ];

    let passed = 0;
    tests.forEach((test, i) => {
        const date = new Date(test.date);
        const isValid = !isNaN(date.getTime()) && test.date !== '';
        
        // Additional validation: check if parsed date matches input
        let matches = false;
        if (isValid && test.date) {
            const parts = test.date.split('-');
            matches = date.getFullYear() === parseInt(parts[0]) &&
                     date.getMonth() + 1 === parseInt(parts[1]) &&
                     date.getDate() === parseInt(parts[2]);
        }
        
        const success = (test.valid && matches) || (!test.valid && !matches);
        if (success) {
            passed++;
            console.log(`✅ Test ${i + 1}: ${test.desc}`);
        } else {
            console.log(`❌ Test ${i + 1}: ${test.desc}`);
            console.log(`   Expected valid: ${test.valid}, Got valid: ${isValid && matches}`);
        }
    });
    
    console.log(`Date validation: ${passed}/${tests.length} tests passed\n`);
    return passed === tests.length;
}

/**
 * Test: Duplicate entry detection
 */
function testDuplicateDetection() {
    console.log('=== Testing Duplicate Entry Detection ===');
    
    const originalEntries = [...entries];
    entries = [
        { date: '2024-01-01', krvaceni: '1' },
        { date: '2024-01-02', krvaceni: '2' }
    ];

    let passed = 0;
    const total = 2;

    // Test 1: Existing date
    const existingEntry = entries.find(entry => entry.date === '2024-01-01');
    if (existingEntry) {
        console.log('✅ Test 1: Detects existing date');
        passed++;
    } else {
        console.log('❌ Test 1: Should detect existing date');
    }

    // Test 2: New date
    const newEntry = entries.find(entry => entry.date === '2024-01-03');
    if (!newEntry) {
        console.log('✅ Test 2: Allows new date');
        passed++;
    } else {
        console.log('❌ Test 2: Should allow new date');
    }

    entries = originalEntries;
    console.log(`Duplicate detection: ${passed}/${total} tests passed\n`);
    return passed === total;
}

/**
 * Test: Symptom value boundaries
 */
function testSymptomValues() {
    console.log('=== Testing Symptom Value Boundaries ===');
    
    const tests = [
        // Bleeding (0-5 scale)
        { field: 'krvaceni', value: '0', valid: true, desc: 'Bleeding: 0 (none)' },
        { field: 'krvaceni', value: '5', valid: true, desc: 'Bleeding: 5 (max)' },
        { field: 'krvaceni', value: '6', valid: false, desc: 'Bleeding: 6 (over max)' },
        { field: 'krvaceni', value: '-1', valid: false, desc: 'Bleeding: -1 (negative)' },
        
        // Other symptoms (0-3 scale)
        { field: 'nalady', value: '0', valid: true, desc: 'Nalady: 0 (none)' },
        { field: 'nalady', value: '3', valid: true, desc: 'Nalady: 3 (max)' },
        { field: 'nalady', value: '4', valid: false, desc: 'Nalady: 4 (over max)' },
    ];

    let passed = 0;
    tests.forEach((test, i) => {
        const value = parseInt(test.value);
        let isValid;
        
        if (test.field === 'krvaceni') {
            isValid = value >= 0 && value <= 5;
        } else {
            isValid = value >= 0 && value <= 3;
        }
        
        const success = test.valid === isValid;
        if (success) {
            passed++;
            console.log(`✅ Test ${i + 1}: ${test.desc}`);
        } else {
            console.log(`❌ Test ${i + 1}: ${test.desc}`);
        }
    });

    console.log(`Symptom values: ${passed}/${tests.length} tests passed\n`);
    return passed === tests.length;
}

/**
 * Run all client-side tests
 */
function runAllTests() {
    console.log('========================================');
    console.log('   PERIOD TRACKER TEST SUITE');
    console.log('========================================\n');
    
    const results = [];
    
    results.push({ name: 'escapeHtml', passed: testEscapeHtml() });
    results.push({ name: 'displayEntries', passed: testDisplayEntries() });
    results.push({ name: 'calculatePeriodPrediction', passed: testPeriodPrediction() });
    results.push({ name: 'dateValidation', passed: testDateValidation() });
    results.push({ name: 'duplicateDetection', passed: testDuplicateDetection() });
    results.push({ name: 'symptomValues', passed: testSymptomValues() });
    
    console.log('========================================');
    console.log('   SUMMARY');
    console.log('========================================');
    
    const totalPassed = results.filter(r => r.passed).length;
    results.forEach(r => {
        console.log(`${r.passed ? '✅' : '❌'} ${r.name}`);
    });
    
    console.log(`\nTotal: ${totalPassed}/${results.length} test suites passed`);
    console.log('========================================\n');
    
    return totalPassed === results.length;
}


// ============================================
// SERVER-SIDE TESTS (for Google Apps Script)
// Add these functions to darky-app-script.js
// ============================================

/**
 * Server-side test for formatDateToISO
 * Copy this function to Google Apps Script and run it
 */
const serverTests_formatDateToISO = `
function testFormatDateToISO() {
  const tests = [
    { input: '2024-01-15', expected: '2024-01-15', desc: 'ISO string' },
    { input: new Date(2024, 0, 15), expected: '2024-01-15', desc: 'Date object' },
    { input: new Date('2024-06-30T12:00:00Z'), expected: '2024-06-30', desc: 'Date with time' },
    { input: '', expected: '', desc: 'Empty string' },
    { input: null, expected: '', desc: 'Null' },
    { input: undefined, expected: '', desc: 'Undefined' },
    { input: 'Mon Jan 15 2024', expected: '2024-01-15', desc: 'Date string format' },
  ];
  
  let passed = 0;
  tests.forEach(function(test, i) {
    const result = formatDateToISO(test.input);
    if (result === test.expected) {
      Logger.log('✅ Test ' + (i+1) + ': ' + test.desc);
      passed++;
    } else {
      Logger.log('❌ Test ' + (i+1) + ': ' + test.desc);
      Logger.log('   Expected: ' + test.expected + ', Got: ' + result);
    }
  });
  
  Logger.log('formatDateToISO: ' + passed + '/' + tests.length + ' tests passed');
}
`;

// Export for Node.js testing (if needed)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        runAllTests,
        testEscapeHtml,
        testDisplayEntries,
        testPeriodPrediction,
        testDateValidation,
        testDuplicateDetection,
        testSymptomValues,
        serverTests_formatDateToISO
    };
}
