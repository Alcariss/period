function doGet(e) {
  try {
    const action = e.parameter.action;
    
    if (action === 'fetch') {
      // Fetch period entries from spreadsheet
      const spreadsheetId = '1nnf4THz2ecMmZUn0eE6eAjBKHZWCIvV1ua5o7LqKIRI';
      const spreadsheet = SpreadsheetApp.openById(spreadsheetId);
      const sheet = spreadsheet.getSheets()[0];
      
      // Get callback parameter for JSONP
      const callback = e.parameter.callback;
      
      // Get all data from the sheet
      const lastRow = sheet.getLastRow();
      const entries = [];
      
      if (lastRow > 1) { // At least 2 rows (header + data)
        const data = sheet.getRange(2, 1, lastRow - 1, 2).getValues(); // Skip header row, get only Date and Symptom columns
        
        entries.push(...data
          .map(row => ({
            date: row[0] ? row[0].toString() : '',
            symptoms: row[1] ? row[1].toString() : ''
          }))
          .filter(entry => entry.date && entry.symptoms) // Remove empty rows
          .reverse()); // Newest on top
      }
      
      const jsonData = JSON.stringify(entries);
      
      // Handle JSONP callback
      if (callback) {
        return ContentService
          .createTextOutput(`${callback}(${jsonData})`)
          .setMimeType(ContentService.MimeType.JAVASCRIPT);
      }
      
      // Regular JSON response (with CORS headers as fallback)
      return ContentService
        .createTextOutput(jsonData)
        .setMimeType(ContentService.MimeType.JSON);
        
    } else if (action === 'save') {
      // Save period entry
      const date = e.parameter.date;
      const symptoms = e.parameter.symptoms || '';
      
      if (!date || !symptoms) {
        const errorMsg = 'ERROR: Missing required parameters (date, symptoms)';
        console.error(errorMsg);
        return ContentService
          .createTextOutput(errorMsg)
          .setMimeType(ContentService.MimeType.TEXT)
          .setHeaders({
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type'
          });
      }
      
      const spreadsheetId = '1nnf4THz2ecMmZUn0eE6eAjBKHZWCIvV1ua5o7LqKIRI';
      const spreadsheet = SpreadsheetApp.openById(spreadsheetId);
      const sheet = spreadsheet.getSheets()[0];
      
      // Check if this is an update (find existing row) or new addition
      const lastRow = sheet.getLastRow();
      let foundRow = -1;
      
      if (lastRow > 1) {
        const data = sheet.getRange(2, 1, lastRow - 1, 2).getValues(); // Skip header row
        
        // Look for existing row with the same date
        for (let i = 0; i < data.length; i++) {
          if (data[i][0] && data[i][0].toString() === date) {
            foundRow = i + 2; // +2 because we skipped header row and array is 0-indexed
            break;
          }
        }
      }
      
      if (foundRow > 0) {
        // Update existing row
        sheet.getRange(foundRow, 1, 1, 2).setValues([[date, symptoms]]);
        console.log('Successfully updated row', foundRow + ':', [date, symptoms]);
        
        return ContentService
          .createTextOutput('SUCCESS: Period entry updated in row ' + foundRow)
          .setMimeType(ContentService.MimeType.TEXT)
          .setHeaders({
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type'
          });
      } else {
        // Add new row
        sheet.appendRow([date, symptoms]);
        console.log('Successfully added new row:', [date, symptoms]);
        console.log('Total rows now:', sheet.getLastRow());
        
        return ContentService
          .createTextOutput('SUCCESS: Period entry added to row ' + sheet.getLastRow())
          .setMimeType(ContentService.MimeType.TEXT)
          .setHeaders({
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type'
          });
      }
        
    } else {
      // Unknown action
      const errorMsg = 'ERROR: Unknown action parameter';
      console.error(errorMsg);
      return ContentService
        .createTextOutput(errorMsg)
        .setMimeType(ContentService.MimeType.TEXT)
        .setHeaders({
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type'
        });
    }
      
  } catch (error) {
    console.error('Error in doGet:', error);
    return ContentService
      .createTextOutput('ERROR: ' + error.toString())
      .setMimeType(ContentService.MimeType.TEXT)
      .setHeaders({
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
      });
  }
}

// Handle OPTIONS requests for CORS preflight
function doOptions(e) {
  return ContentService
    .createTextOutput('')
    .setMimeType(ContentService.MimeType.TEXT)
    .setHeaders({
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    });
}

// Alternative function to test if the script is accessible
function doPost(e) {
  return doGet(e);
}