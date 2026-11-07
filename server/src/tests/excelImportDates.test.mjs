import fs from 'node:fs';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import os from 'node:os';
const projectRoot=fileURLToPath(new URL('../../../',import.meta.url));
const out=fs.mkdtempSync(path.join(os.tmpdir(),'hoachtoan-date-test-'));
process.env.NODE_ENV='test';
process.env.DB_PATH=path.join(out,`isolated-${Date.now()}.db`);
process.env.GROUP_ALLOCATIONS_PATH=path.join(out,'test-groups.json');
process.env.EXCEL_PATH=path.join(projectRoot,'tháng 1.xlsx');
new DatabaseSync(process.env.DB_PATH).close();
const require=createRequire(new URL('../../package.json',import.meta.url));
const XLSX=require('xlsx');
const {ExcelImportService:service}=await import('../services/excelImportService.js');
const {db}=await import('../db/database.js');
function parse(headers,rows,merges=[]) {
  const sheet=XLSX.utils.aoa_to_sheet([headers,...rows]);sheet['!merges']=merges;
  const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,sheet,'BangKe');
  return service.parseAndPreview({buffer:XLSX.write(wb,{type:'buffer',bookType:'xlsx'}),filename:'bang-ke-test.xlsx'});
}
const tests=[
 ['Sheet tổng hợp đầu file cho chọn bảng chuyến trước khi đọc',()=>{
   const wb=XLSX.utils.book_new();
   XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([['STT','THÁNG','TỔNG CƯỚC'],[1,'THÁNG 1',1000000]]),'SỐ LIỆU NĂM');
   XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([['STT','NGÀY','CHỦ HÀNG','TUYẾN','CƯỚC VÀO'],[1,'07/11/2026','A','HP-HN',1000000]]),'T11-2026 ');
   const buffer=XLSX.write(wb,{type:'buffer',bookType:'xlsx'});
   const selection=service.parseAndPreview({buffer,filename:'ke-hoach.xlsx'});
   assert.equal(selection.requires_sheet_selection,true);
   assert.equal(selection.rows.length,0);
   assert.equal(selection.sheet_options[0].can_import,false);
   const preview=service.parseAndPreview({buffer,filename:'ke-hoach.xlsx',sheetName:'T11-2026 '});
   assert.equal(preview.total_rows,1);assert.equal(preview.rows[0].trip_date,'2026-11-07');
   assert.throws(()=>service.parseAndPreview({buffer,filename:'ke-hoach.xlsx',sheetName:'khong-co'}),/Không tìm thấy sheet/);
 }],
 ['Dòng mẫu chỉ có STT được bỏ qua có cảnh báo',()=>{
   const p=parse(['STT','NGÀY','CHỦ HÀNG','TUYẾN','CƯỚC VÀO'],[[1,'07/11/2026','A','HP-HN',1000000],[2],[3]]);
   assert.equal(p.total_rows,1);assert.equal(p.summary.total_cuoc_goc,1000000);
   assert(p.warnings.some(w=>w.includes('2 dòng mẫu')));
 }],
 ['Ngày thanh toán không ghi đè ngày chạy',()=>{
   const p=parse(['STT','NGÀY CHẠY','CHỦ HÀNG','TUYẾN','CƯỚC VÀO','NGÀY THANH TOÁN'],[[1,'07/11/2026','TEST','HP-HN',1000000,'']]);
   assert.equal(p.rows[0].trip_date,'2026-11-07');assert.equal(p.applied_mapping.trip_date,'B');
 }],
 ['Không lấy ngày hẹn khi có ngày chạy',()=>{
   const p=parse(['STT','NGÀY HẸN','CHỦ HÀNG','TUYẾN','CƯỚC VÀO','NGÀY CHẠY'],[[1,'10/11/2026','TEST','HP-HN',1000000,'07/11/2026']]);
   assert.equal(p.rows[0].trip_date,'2026-11-07');
 }],
 ['Tiêu đề ngày chạy không dấu',()=>{
   const p=parse(['STT','NGAY CHAY','CHỦ HÀNG','TUYẾN','CƯỚC VÀO'],[[1,'07/11/2026','TEST','HP-HN',1000000]]);
   assert.equal(p.rows[0].trip_date,'2026-11-07');
 }],
 ['Ngày gộp hai dòng giữ đủ hai chuyến',()=>{
   const p=parse(['STT','NGÀY','CHỦ HÀNG','TUYẾN','CƯỚC VÀO'],[[1,'07/11/2026','TEST A','HP-HN',1000000],[2,null,'TEST B','HP-HN',2000000]],[{s:{r:1,c:1},e:{r:2,c:1}}]);
   assert.equal(p.rows.length,2);assert.equal(p.rows[1].trip_date,'2026-11-07');assert.equal(p.summary.total_cuoc_goc,3000000);
 }],
 ['Ngày trống chưa gộp phải báo đúng ô, không tự lấy ngày trên',()=>{
   assert.throws(()=>parse(['STT','NGÀY','CHỦ HÀNG','TUYẾN','CƯỚC VÀO'],[[1,'07/11/2026','A','HP-HN',1],[2,null,'B','HP-HN',2]]),/dòng 3, ô B3: Thiếu ngày chạy/);
 }],
 ['Thiếu tiêu đề ngày chạy có thông báo hướng dẫn',()=>{
   assert.throws(()=>parse(['STT','NGÀY THANH TOÁN','CHỦ HÀNG','TUYẾN','CƯỚC VÀO'],[[1,'07/11/2026','A','HP-HN',1]]),/không nhận diện được cột ngày chạy/);
 }],
 ['Ngày số Excel vẫn nhận đúng',()=>{
   const p=parse(['STT','NGÀY','CHỦ HÀNG','TUYẾN','CƯỚC VÀO'],[[1,46333,'A','HP-HN',1]]);
   assert.equal(p.rows[0].trip_date,'2026-11-07');
 }],
 ['Excel doanh nghiệp gốc giữ nguyên số dòng và tổng cước',()=>{
   const p=service.parseAndPreview({buffer:fs.readFileSync(process.env.EXCEL_PATH),filename:'tháng 1.xlsx'});
   assert.equal(p.total_rows,77);assert.equal(p.summary.total_cuoc_goc,338200000);
 }]
];
let fail=0;
for(const [name,test] of tests){try{test();console.log('PASS',name);}catch(error){fail++;console.error('FAIL',name,error.message);}}
db.close();process.exitCode=fail?1:0;
console.log(JSON.stringify({pass:tests.length-fail,fail}));

