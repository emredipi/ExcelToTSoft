const { GoogleSpreadsheet } = require('google-spreadsheet');
const axios = require('axios');
const qs = require('querystring');

let {excel,token,baseUrl} = require('./api');

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
		if(!Object.success) console.error(Object.message[0].text);
		if(Object.data instanceof Array && Object.data.length===1){
			return Object.data[0];
		}else{
			return Object;
		}
	})
	.catch((err) => {
		console.error("HATA!!!\n",err);
		return null;
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
}

async function main() {
	console.log("PROGRAM STARTED");
	await doc.useServiceAccountAuth(require('./client_secret'));
	await doc.loadInfo();
	const sheet = doc.sheetsByIndex[0];
	const brand = sheet.title;
	const rows = await sheet.getRows();
	console.log("Toplam satır sayısı:"+rows.length);
	line();
	categories = await fetchCategories();

	let name = rows[0]["AÇIKLAMA"];

	let model = rows[0]["MODEL"];
	let engine = rows[0]["MOTOR"].replace(/ \(.*\)/g,"");
	let year = rows[0]["YIL"];
	let power = rows[0]["KW / BG"];

	let product = await get("product/get",{
		"ProductName":name
	});

	let category = await findCategory(categories,[
		brand,
		model,
		engine,
		year,
		power
	]);
	let CategoryCode="C"+category.category_id;

	console.log("ProductCode: ",product.ProductCode);
	console.log("CategoryCode: ",CategoryCode);
	//console.log(category);
	line();
	let res = await get("product/addCategory",{
		data:JSON.stringify([ { "ProductCode": product.ProductCode, "CategoryCode": CategoryCode } ])
	});
	if (res.success) console.log(res.message[0].text);
}
main();
