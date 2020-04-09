const { GoogleSpreadsheet } = require('google-spreadsheet');
const axios = require('axios');
const qs = require('querystring');

let {excel,token,baseUrl,info,options} = require('./api');

const doc = new GoogleSpreadsheet(excel);
let categories = [];
let filters = [];

function fetch(url, body, custom = false){
	const requestBody = {
		token,
		...body,
		FetchExactMatch: true
	};
	const config = {
		headers: {
			'Content-Type': 'application/x-www-form-urlencoded'
		}
	};
	return axios.post(baseUrl+'/'+url, custom?body:qs.stringify(requestBody), config);
}

async function get(url, data={}){
	return await fetch(url,data)
	.then((result) => {
		let Object=result.data;
		if(!Object.success) throw Object.message[0].text;
		if(Object.data instanceof Array && Object.data.length===1){
			return Object.data[0];
		}else{
			return Object;
		}
	});
}

async function readJSON(path) {
	'use strict';
	const fs = require('fs');
	let rawData = fs.readFileSync(path);
	return JSON.parse(rawData);
}

function line(){
	console.log("-------------\n\n\n");
}

function preLine(number){
	let text="";
	for (let i=0;i<number;i++){
		text+="-";
	}
	return text;
}

async function chunk(array, size) {
	const chunked_arr = [];
	for (let i = 0; i < array.length; i++) {
		const last = chunked_arr[chunked_arr.length - 1];
		if (!last || last.length === size) {
			chunked_arr.push([array[i]]);
		} else {
			last.push(array[i]);
		}
	}
	return chunked_arr;
}

async function findCategory(categories,array){
	let word = array[0];
	for(let cat of categories){
		//console.log(preLine(5-array.length)+cat.text);
		//console.log(JSON.stringify(cat));
		if(cat.text===word.trim()){
			if(array.length===1){
				//console.log(cat);
				return cat;
			}else{
				[, ...newArray] = array;
				return findCategory(cat.children,newArray);
			}
		}
	}
	throw "Kategori bulunamadı.";
}

async function setProductCategory(row,categories){
	let brand = row["ARAÇ"];
	let model = row["MODEL"];
	let engine = row["MOTOR"];
	let year = row["YIL"];
	let power = row["KW / BG"];
	let category = await findCategory(categories,[
		brand,
		model,
		engine,
		year,
		power
	]);
	let CategoryCode="C"+category["category_id"];
	let res = await get("product/addCategory",{
		data:JSON.stringify([ { "ProductCode": row["ID"], "CategoryCode": CategoryCode } ])
	});
	if (info && res.success) console.log(res.message[0].text);
}

async function setFilter(row,filters){
	let filter1 = row["FİLTRE 1"];
	let filter2 = row["FİLTRE 2"];
	for(let filter of filters){
		if(filter.Name===filter1)
			for (let childFilter of filter.Options){
				if(childFilter.Name===filter2) {
					let filter1ID = filter["Id"];
					let filter2ID = childFilter["Id"];
					await get('filter/setFilterValues',{
						data:JSON.stringify( [
							{
							"ProductCode": row["ID"],
							"GroupId": filter1ID,
							"Type": "single",
							"Value": filter2ID
							}
						])
					});
					return true;
				}
			}
	}
	throw `Filtre bulunamadı (${filter1} | ${filter2})`
}

let tableRows = [];
async function setProductTable(){
	if(tableRows.length===0) return false;
	let keywords = ["ARAÇ","MODEL","TEKNİK TİP","MOTOR","YIL","MOTOR KODU","KW / BG"];
	let ids = {};
	let html = '<table class="api-detail-table"><thead><tr>';
	html+=`${keywords.map(keyword=>`<td>${keyword}</td>`).join("")}</tr></thead>`;
	for(let row of tableRows){
		html+= `<tr>${keywords.map(keyword=>`<td>${row[keyword]}</td>`).join("")}</tr>`;
		ids[row["ID"]]=true;
	}
	let code = tableRows[0]["MALZEME KODU"];
	html+= '</table>';

	tableRows = [];
	let tables = Object.keys(ids).map(id=>({
		"ProductCode": id,
		"Details": html
	}));
	let chunked = await chunk(tables,10);
	for(let table of chunked){
		toplam += table.length;
		let res = await get("product/updateProducts",{
			data:JSON.stringify(
				table
			)
		});
	}
	console.log("success",code)
}

async function main() {
	categories = await readJSON('categories.json').data;
	filters = await readJSON('filters.json');
	console.log("PROGRAM STARTED");
	await doc.useServiceAccountAuth(require('./client_secret'));
	await doc.loadInfo();
	const sheet = doc.sheetsByIndex[0];
	let counter = {"success":0, "error":0};

	let { index, limit, last } = options;
	index-=2; last-=2;
	let prevID = 0;
	let prevCode="";
	console.time();
	while(index<=last){
		if ((index+limit)>last) limit = (last-index)%limit+1;
		const rows = await sheet.getRows({
			offset:index,
			limit
		});
		for(let row of rows){
			try{
				if(prevID!==row["ID"]) {
					await setFilter(row,filters);
					prevID = row["ID"];
					console.log("success",row["ID"]);
				}
				if(prevCode!==row["MALZEME KODU"] || index===last){
					await setProductTable();
					prevCode = row["MALZEME KODU"];
				}
				tableRows.push(row);
				await setProductCategory(row,categories);
				counter.success++;
			}catch (e) {
				await console.error("Hata:",e,"lineNumber:",index+2);
				counter.error++;
			}
			index++;
		}
	}
	line();
	console.log("Başarılı Sonuç: ",counter.success);
	console.log("Hatalı Sonuç: ",counter.error);
	console.log("Toplam: ",counter.success+counter.error);
	console.timeEnd();
}
main();
