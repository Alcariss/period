function doGet(e) {
  try {
    const action = e.parameter.action;
    
    if (action === 'fetch') {
      // Fetch quotes from spreadsheet
      const spreadsheetId = '17t-3sEqlnF9o6aklvfv4yfZJJOJA0ZzwPFf-ezSQwXI';
      const spreadsheet = SpreadsheetApp.openById(spreadsheetId);
      const sheet = spreadsheet.getSheets()[0];
      
      // Get callback parameter for JSONP
      const callback = e.parameter.callback;
      
      // Get all data from the sheet
      const lastRow = sheet.getLastRow();
      const lastCol = sheet.getLastColumn();
      const quotes = [];
      
      if (lastRow > 1) { // At least 2 rows (header + data)
        const data = sheet.getRange(1, 1, lastRow, Math.max(lastCol, 5)).getValues();
        
        // Skip header row and convert to objects
        quotes.push(...data
          .slice(1) // Skip header row
          .map(row => ({
            kdo: row[0] ? row[0].toString() : '',
            odKoho: row[1] ? row[1].toString() : '',
            co: row[2] ? row[2].toString() : '',
            odkaz: row[3] ? row[3].toString() : '',
            status: row[4] ? row[4].toString() : ''
          }))
          .filter(quote => quote.kdo && quote.co) // Remove empty rows
          .reverse()); // Newest on top
      }
      
      const jsonData = JSON.stringify(quotes);
      
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
      // Save gift
      const kdo = e.parameter.kdo;
      const odKoho = e.parameter.odKoho || '';
      const co = e.parameter.co;
      const odkaz = e.parameter.odkaz || '';
      const status = e.parameter.status;
      
      if (!kdo || !co || !status) {
        const errorMsg = 'ERROR: Missing required parameters (kdo, co, status)';
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
      
      const spreadsheetId = '17t-3sEqlnF9o6aklvfv4yfZJJOJA0ZzwPFf-ezSQwXI';
      const spreadsheet = SpreadsheetApp.openById(spreadsheetId);
      const sheet = spreadsheet.getSheets()[0];
      
      // Check if this is an update (find existing row) or new addition
      const lastRow = sheet.getLastRow();
      let foundRow = -1;
      
      if (lastRow > 1) {
        const data = sheet.getRange(1, 1, lastRow, 5).getValues();
        
        // Look for existing row (skip header row)
        for (let i = 1; i < data.length; i++) {
          if (data[i][0] === kdo && data[i][2] === co) {
            foundRow = i + 1; // +1 because getRange is 1-indexed
            break;
          }
        }
      }
      
      if (foundRow > 0) {
        // Update existing row
        sheet.getRange(foundRow, 1, 1, 5).setValues([[kdo, odKoho, co, odkaz, status]]);
        console.log('Successfully updated row', foundRow + ':', [kdo, odKoho, co, odkaz, status]);
        
        return ContentService
          .createTextOutput('SUCCESS: Gift updated in row ' + foundRow)
          .setMimeType(ContentService.MimeType.TEXT)
          .setHeaders({
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type'
          });
      } else {
        // Add new row
        sheet.appendRow([kdo, odKoho, co, odkaz, status]);
        console.log('Successfully added new row:', [kdo, odKoho, co, odkaz, status]);
        console.log('Total rows now:', sheet.getLastRow());
        
        return ContentService
          .createTextOutput('SUCCESS: Gift added to row ' + sheet.getLastRow())
          .setMimeType(ContentService.MimeType.TEXT)
          .setHeaders({
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type'
          });
      }
        
    } else {
      // Legacy quote functionality for backward compatibility
      const date = e.parameter.date;
      const quote = e.parameter.quote;
      
      if (!date || !quote) {
        const errorMsg = 'ERROR: Missing date or quote parameter';
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
      
      const spreadsheetId = '17t-3sEqlnF9o6aklvfv4yfZJJOJA0ZzwPFf-ezSQwXI';
      const spreadsheet = SpreadsheetApp.openById(spreadsheetId);
      const sheet = spreadsheet.getSheets()[0];
      
      // Add the quote to the sheet
      sheet.appendRow([date, quote]);
      
      console.log('Successfully added row:', [date, quote]);
      console.log('Total rows now:', sheet.getLastRow());
      
      return ContentService
        .createTextOutput('SUCCESS: Quote added to row ' + sheet.getLastRow())
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