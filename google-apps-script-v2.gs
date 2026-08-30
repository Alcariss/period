const API_VERSION = '2.0.0';
const SCHEMA_VERSION = 1;

const PRIMARY_SHEET_URL = 'https://docs.google.com/spreadsheets/d/PRIMARY_SHEET_ID/edit';
const FALLBACK_SHEET_URL = 'https://docs.google.com/spreadsheets/d/FALLBACK_SHEET_ID/edit';

const FETCH_ERROR_CODES = {
  UNAUTHORIZED: 'UNAUTHORIZED',
  SHEET_NOT_FOUND: 'SHEET_NOT_FOUND',
  SCHEMA_MISMATCH: 'SCHEMA_MISMATCH',
  INTERNAL_ERROR: 'INTERNAL_ERROR'
};

const CANONICAL_COLUMN_ORDER = ['date', 'krvaceni', 'nalady', 'tlak', 'nadymani', 'energie', 'notes'];

const SYMPTOM_LIMITS = {
  krvaceni: 5,
  nalady: 3,
  tlak: 3,
  nadymani: 3,
  energie: 3
};

function doGet(e) {
  if (!e || !e.parameter) {
    return jsonOutput({
      success: false,
      data: null,
      meta: responseMeta('primary'),
      errorCode: FETCH_ERROR_CODES.INTERNAL_ERROR,
      message: 'Missing parameters'
    });
  }

  var action = e.parameter.action;

  var supported = ['fetch', 'save', 'delete'];
  if (supported.indexOf(action) === -1) {
    return jsonOutput({
      success: false,
      data: null,
      meta: responseMeta('primary'),
      errorCode: FETCH_ERROR_CODES.INTERNAL_ERROR,
      message: 'Unsupported action'
    });
  }

  if (!isAuthorized(e.parameter.token)) {
    return jsonOutput({
      success: false,
      data: null,
      meta: responseMeta('primary'),
      errorCode: FETCH_ERROR_CODES.UNAUTHORIZED,
      message: 'Unauthorized'
    });
  }

  if (action === 'save') {
    return handleSave(e.parameter);
  }

  if (action === 'delete') {
    return handleDelete(e.parameter);
  }

  return handleFetch();
}

function doPost(e) {
  return doGet(e);
}

function handleFetch() {
  try {
    const primaryRows = readSheetRows(PRIMARY_SHEET_URL);
    return jsonOutput({
      success: true,
      data: primaryRows,
      meta: responseMeta('primary')
    });
  } catch (error) {
    const primaryCode = classifyFetchError(error);

    if (!shouldAttemptFallback(primaryCode)) {
      return jsonOutput({
        success: false,
        data: [],
        meta: responseMeta('primary'),
        errorCode: primaryCode,
        message: String(error)
      });
    }

    try {
      const fallbackRows = readSheetRows(FALLBACK_SHEET_URL);
      return jsonOutput({
        success: true,
        data: fallbackRows,
        meta: responseMeta('fallback')
      });
    } catch (fallbackError) {
      return jsonOutput({
        success: false,
        data: [],
        meta: responseMeta('fallback'),
        errorCode: classifyFetchError(fallbackError),
        message: String(fallbackError)
      });
    }
  }
}

function handleSave(params) {
  var date = String(params.date || '').trim();

  if (!date || !isValidIsoDate(date)) {
    return jsonOutput({
      success: false,
      data: null,
      meta: responseMeta('primary'),
      errorCode: 'VALIDATION_ERROR',
      message: 'A valid date is required'
    });
  }

  var entry = {
    date: date,
    krvaceni: clampSymptom(params.krvaceni, SYMPTOM_LIMITS.krvaceni),
    nalady: clampSymptom(params.nalady, SYMPTOM_LIMITS.nalady),
    tlak: clampSymptom(params.tlak, SYMPTOM_LIMITS.tlak),
    nadymani: clampSymptom(params.nadymani, SYMPTOM_LIMITS.nadymani),
    energie: clampSymptom(params.energie, SYMPTOM_LIMITS.energie),
    notes: String(params.notes || '').substring(0, 1000)
  };

  try {
    var sheetId = normalizeSheetId(PRIMARY_SHEET_URL);
    var sheet = SpreadsheetApp.openById(sheetId).getActiveSheet();
    var values = sheet.getDataRange().getValues();
    var headers = values[0].map(function (value) {
      return String(value).trim().toLowerCase();
    });

    var columnMap = resolveColumnMap(headers);
    var dateCol = columnMap.date;

    var foundRow = -1;
    for (var i = 1; i < values.length; i++) {
      if (formatDateToISO(values[i][dateCol]) === date) {
        foundRow = i + 1;
        break;
      }
    }

    var rowValues = [
      entry.date,
      entry.krvaceni,
      entry.nalady,
      entry.tlak,
      entry.nadymani,
      entry.energie,
      entry.notes
    ];

    if (foundRow > 0) {
      sheet.getRange(foundRow, 1, 1, rowValues.length).setValues([rowValues]);
    } else {
      sheet.appendRow(rowValues);
    }

    return jsonOutput({
      success: true,
      data: entry,
      meta: responseMeta('primary')
    });
  } catch (error) {
    return jsonOutput({
      success: false,
      data: null,
      meta: responseMeta('primary'),
      errorCode: FETCH_ERROR_CODES.INTERNAL_ERROR,
      message: String(error)
    });
  }
}

function handleDelete(params) {
  var date = String(params.date || '').trim();

  if (!date) {
    return jsonOutput({
      success: false,
      data: null,
      meta: responseMeta('primary'),
      errorCode: 'VALIDATION_ERROR',
      message: 'date is required'
    });
  }

  try {
    var sheetId = normalizeSheetId(PRIMARY_SHEET_URL);
    var sheet = SpreadsheetApp.openById(sheetId).getActiveSheet();
    var values = sheet.getDataRange().getValues();
    var headers = values[0].map(function (value) {
      return String(value).trim().toLowerCase();
    });

    var columnMap = resolveColumnMap(headers);
    var dateCol = columnMap.date;

    for (var i = 1; i < values.length; i++) {
      if (formatDateToISO(values[i][dateCol]) === date) {
        sheet.deleteRow(i + 1);

        return jsonOutput({
          success: true,
          data: null,
          meta: responseMeta('primary')
        });
      }
    }

    return jsonOutput({
      success: false,
      data: null,
      meta: responseMeta('primary'),
      errorCode: 'NOT_FOUND',
      message: 'Entry not found'
    });
  } catch (error) {
    return jsonOutput({
      success: false,
      data: null,
      meta: responseMeta('primary'),
      errorCode: FETCH_ERROR_CODES.INTERNAL_ERROR,
      message: String(error)
    });
  }
}

function responseMeta(source) {
  return {
    apiVersion: API_VERSION,
    schemaVersion: SCHEMA_VERSION,
    source: source,
    fetchedAt: new Date().toISOString()
  };
}

function isAuthorized(token) {
  // Set via Apps Script Project Settings > Script Properties, never in source.
  var expectedToken = PropertiesService.getScriptProperties().getProperty('SHARED_TOKEN');
  return expectedToken && token === expectedToken;
}

function shouldAttemptFallback(errorCode) {
  return errorCode === FETCH_ERROR_CODES.SCHEMA_MISMATCH
    || errorCode === FETCH_ERROR_CODES.SHEET_NOT_FOUND;
}

function classifyFetchError(error) {
  const text = String(error || '');

  if (text.indexOf('Sheet not found') >= 0 || text.indexOf('Cannot find') >= 0) {
    return FETCH_ERROR_CODES.SHEET_NOT_FOUND;
  }

  if (text.indexOf('SCHEMA_MISMATCH') >= 0) {
    return FETCH_ERROR_CODES.SCHEMA_MISMATCH;
  }

  return FETCH_ERROR_CODES.INTERNAL_ERROR;
}

function jsonOutput(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}

function readSheetRows(sheetId) {
  const normalizedId = normalizeSheetId(sheetId);
  const sheet = SpreadsheetApp.openById(normalizedId).getActiveSheet();

  if (sheet.getLastRow() < 1) {
    return [];
  }

  const values = sheet.getDataRange().getValues();
  const headers = values[0].map(function (value) {
    return String(value).trim().toLowerCase();
  });

  const columnMap = resolveColumnMap(headers);

  const rows = values.slice(1).map(function (row) {
    return mapRow(columnMap, row);
  }).filter(function (entry) {
    return entry.date;
  });

  rows.sort(function (a, b) {
    return new Date(b.date).getTime() - new Date(a.date).getTime();
  });

  return rows;
}

function normalizeSheetId(value) {
  if (value === null || value === undefined) {
    throw new Error('Invalid argument: id (missing value)');
  }

  const raw = String(value).trim();
  if (!raw) {
    throw new Error('Invalid argument: id (empty value)');
  }

  if (raw.indexOf('docs.google.com/spreadsheets/d/') >= 0) {
    const match = raw.match(/\/d\/([a-zA-Z0-9-_]+)/);
    if (!match || !match[1]) {
      throw new Error('Invalid argument: id (could not parse from URL)');
    }

    return match[1];
  }

  return raw;
}

// Falls back to the fixed A-G order the original app always assumed, so
// real-world header labels (e.g. "Malady", "Tlak v brise") need no migration.
function resolveColumnMap(headers) {
  var namedMap = {};
  var allNamedHeadersFound = true;

  CANONICAL_COLUMN_ORDER.forEach(function (key) {
    var index = headers.indexOf(key);
    if (index === -1) {
      allNamedHeadersFound = false;
    }
    namedMap[key] = index;
  });

  if (allNamedHeadersFound) {
    return namedMap;
  }

  var positionalMap = {};
  CANONICAL_COLUMN_ORDER.forEach(function (key, index) {
    positionalMap[key] = index;
  });
  return positionalMap;
}

function mapRow(columnMap, row) {
  return {
    date: formatDateToISO(row[columnMap.date]),
    krvaceni: clampSymptom(row[columnMap.krvaceni], SYMPTOM_LIMITS.krvaceni),
    nalady: clampSymptom(row[columnMap.nalady], SYMPTOM_LIMITS.nalady),
    tlak: clampSymptom(row[columnMap.tlak], SYMPTOM_LIMITS.tlak),
    nadymani: clampSymptom(row[columnMap.nadymani], SYMPTOM_LIMITS.nadymani),
    energie: clampSymptom(row[columnMap.energie], SYMPTOM_LIMITS.energie),
    notes: row[columnMap.notes] ? String(row[columnMap.notes]) : ''
  };
}

function clampSymptom(value, max) {
  var parsed = parseInt(value, 10);
  if (isNaN(parsed)) {
    return '0';
  }

  return String(Math.max(0, Math.min(max, parsed)));
}

function isValidIsoDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function formatDateToISO(dateValue) {
  if (!dateValue) return '';

  if (typeof dateValue === 'string') {
    if (isValidIsoDate(dateValue)) {
      return dateValue;
    }
    dateValue = new Date(dateValue);
  }

  if (dateValue instanceof Date && !isNaN(dateValue)) {
    const year = dateValue.getFullYear();
    const month = String(dateValue.getMonth() + 1).padStart(2, '0');
    const day = String(dateValue.getDate()).padStart(2, '0');
    return year + '-' + month + '-' + day;
  }

  return '';
}
