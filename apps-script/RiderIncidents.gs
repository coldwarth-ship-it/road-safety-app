/** Read only the public incident tab from the SAME spreadsheet as the existing zones API.
 * Call readRiderIncidents_(existingSpreadsheet) from both doGet and apiGetData
 * when sheet === 'rider_incidents'. Do not replace existing routes.
 */
function readRiderIncidents_(spreadsheet) {
  var sheet = spreadsheet.getSheetByName('อุบัติเหตุจริง');
  if (!sheet) return {status:'error',message:'ไม่พบแท็บอุบัติเหตุจริง'};
  var headers = ['รหัสเหตุ','รหัสจุด','ชื่อจุด','จังหวัด','อำเภอ','ละติจูด','ลองจิจูด','Level','รายละเอียดโดยประมาณ','สาเหตุ','การป้องกัน','สถานะ'];
  var rows = sheet.getDataRange().getDisplayValues();
  var actual = rows.shift() || [];
  var indexes = headers.map(function(header) { return actual.indexOf(header); });
  if (indexes.some(function(index) { return index < 0; }))
    return {status:'error',message:'หัวคอลัมน์ในแท็บอุบัติเหตุจริงไม่ครบ'};
  var data = rows.filter(function(row) {
    return String(row[indexes[11]] || '').trim() === 'เผยแพร่';
  }).map(function(row) {
    var publicRow = {};
    headers.forEach(function(header,index) { publicRow[header] = row[indexes[index]] || ''; });
    return publicRow;
  });
  return {status:'ok',dataset:'rider_incidents',data:data};
}
