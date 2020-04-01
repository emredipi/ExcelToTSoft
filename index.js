const { GoogleSpreadsheet } = require('google-spreadsheet');
const axios = require('axios');
const qs = require('querystring');

let {excel,token,baseUrl,info,options} = require('./api');

const doc = new GoogleSpreadsheet(excel);
let categories = [];

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

async function fetchCategories() {
	'use strict';
	const fs = require('fs');
	let rawData = fs.readFileSync('categories.json');
	return JSON.parse(rawData).data;
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

async function findCategory(categories,array){
	let word = array[0];
	for(let cat of categories){
		//console.log(preLine(5-array.length)+cat.text);
		//console.log(JSON.stringify(cat));
		if(cat.text===word){
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

async function main() {
	console.log("PROGRAM STARTED");
	await doc.useServiceAccountAuth(require('./client_secret'));
	await doc.loadInfo();
	const sheet = doc.sheetsByIndex[0];

	categories = await fetchCategories();
	let { index, limit, last } = options;
	while(index<=last){
		if ((index+limit)>last) limit = (last-index)%limit+1;
		const rows = await sheet.getRows({
			offset:index,
			limit
		});
		for(let row of rows){
			try{
				await setProductCategory(row,categories);
			}catch (e) {
				await console.error("Hata:",e,"lineNumber:",index);
			}
			index++;
		}
	}
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
main();
