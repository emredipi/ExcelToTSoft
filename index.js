const {GoogleSpreadsheet} = require('google-spreadsheet');
const axios = require('axios');
const qs = require('querystring');
'use strict';
const fs = require('fs');

let {excel, token, baseUrl, info, options, google_console_key} = require('./api');

const doc = new GoogleSpreadsheet(excel);
let categories = [];
let filters = [];

function fetch(url, body, custom = false) {
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
	return axios.post(baseUrl + '/' + url, custom ? body : qs.stringify(requestBody), config);
}

async function get(url, data = {}) {
	return await fetch(url, data)
	.then((result) => {
		let Object = result.data;
		if (!Object.success) throw Object.message[0].text;
		if (Object.data instanceof Array && Object.data.length === 1) {
			return Object.data[0];
		} else {
			return Object;
		}
	});
}

async function readJSON(path) {
	let rawData = fs.readFileSync(path);
	return JSON.parse(rawData);
}

function line() {
	console.log("-------------\n\n\n");
}

function preLine(number) {
	let text = "";
	for (let i = 0; i < number; i++) {
		text += "-";
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

async function createCategories(children, parent = null) {
	let data = { //todo random id oluşturma function oluşturulacak, tüm id'leri tarayıp eşleşen varsa yeniden random çalışacak
		"CategoryCode": "X" + Math.floor(Math.random() * (9999999 - 1000000) + 1000000),
		"CategoryName": children[0],
		"IsActive": "1",
	};
	if (parent) data.ParentCode = parent.id;
	let response = await get('category/setCategories', {
		data: JSON.stringify([data])
	});
	if (response.success) {
		if (info) console.log("Yeni kategori oluşturuldu:", children[0]);
		let id = response.message[0].id;
		let catObject = {
			id,
			text: children[0],
			children: []
		};
		if (parent) parent.children.push(catObject);
		else categories.push(catObject);
		await writeCategories();
		if (children.length === 1)
			return catObject;
		else {
			let [, ...newArray] = children;
			return createCategories(newArray, catObject);
		}
	}
}

async function findCategory(array, parent = null) {
	let word = array[0];
	let category = parent ? parent : {"children": categories};
	for (let cat of category.children) {
		if (cat.text === word.trim()) {
			if (array.length === 1) {
				return cat;
			} else {
				let [, ...newArray] = array;
				return findCategory(newArray, cat);
			}
		}
	}
	return await createCategories(array, parent);
}

async function setProductCategory(row) {
	let brand = row["ARAÇ"];
	let model = row["MODEL"];
	let engine = row["MOTOR"];
	let year = row["YIL"];
	let power = row["KW / BG"];
	let category = await findCategory([
		brand,
		model,
		engine,
		year,
		power
	]);
	let res = await get("product/addCategory", {
		data: JSON.stringify([{"ProductCode": row["ID"], "CategoryCode": category.id}])
	});
	if (info && res.success) console.log(res.message[0].text);
}

async function setFilter(row, filters) {
	let filter1 = row["FİLTRE 1"];
	let filter2 = row["FİLTRE 2"];
	for (let filter of filters) {
		if (filter.Name === filter1)
			for (let childFilter of filter.Options) {
				if (childFilter.Name === filter2) {
					let filter1ID = filter["Id"];
					let filter2ID = childFilter["Id"];
					await get('filter/setFilterValues', {
						data: JSON.stringify([
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

async function setProductTable() {
	if (tableRows.length === 0) return false;
	let keywords = ["ARAÇ", "MODEL", "TEKNİK TİP", "MOTOR", "YIL", "MOTOR KODU", "KW / BG"];
	let ids = {};
	let html = '<table class="api-detail-table"><thead><tr>';
	html += `${keywords.map(keyword => `<td>${keyword}</td>`).join("")}</tr></thead>`;
	//todo KW / BG ayrı kolonlardan çekilecek
	for (let row of tableRows) {
		html += `<tr>${keywords.map(keyword => `<td>${row[keyword]}</td>`).join("")}</tr>`;
		ids[row["ID"]] = true;
	}
	html += '</table>';

	tableRows = [];
	let tables = Object.keys(ids).map(id => ({
		"ProductCode": id,
		"Details": html
	}));
	let chunked = await chunk(tables, 10);
	let toplam = 0;
	for (let table of chunked) {
		toplam += table.length;
		let res = await get("product/updateProducts", {
			data: JSON.stringify(
				table
			)
		});
	}
}

async function writeCategories() {
	await fs.writeFile('categories.json', JSON.stringify(categories), (err) => {
		if (err) throw err;
	});
}

async function writeLastLineNumber(number) {
	await fs.writeFile('lastlinenumber.txt', number, (err) => {
		if (err) throw err;
	});
}

async function fetchCategories() {
	let categoriesObject = await get("category/getCategoryTree").catch(e => {
		console.error(e);
		process.exit(1);
	});
	categories = await categoriesObject.data.filter(category => category["is_active"] === "1");
	console.log('Kategoriler İndirildi');
	await writeCategories();
	return categories;
}

let errorLines = [];

async function main() {
	console.log("Program Başladı");
	if (options.debugMode) {
		errorLines = fs.readFileSync('./log.txt').toString().match(/(?!lineNumber: )\d+/g).map(line => Number(line));
	}
	categories = (options.fetchCategories) ? await fetchCategories() : await readJSON('categories.json');
	filters = await readJSON('filters.json');
	await doc.useApiKey(google_console_key);
	await doc.loadInfo();
	const sheet = doc.sheetsByIndex[0];
	let counter = {"success": 0, "error": 0};

	let {index, limit, last} = options;
	index -= 2;
	last -= 2;
	let prevID = 0;
	let prevCode = "";
	console.time();
	if (options.debugMode) {
		index = 0;
		last = errorLines.length - 1;
		fs.writeFileSync('log.txt', "");
	}
	while (index <= last) {
		if ((index + limit) > last) limit = (last - index) % limit + 1;
		const rows = await sheet.getRows(options.debugMode ? {
			offset: errorLines[index - 2],
			limit
		} : {
			offset: index,
			limit: 1
		});
		for (let row of rows) {
			try {
				if (options.setFilters && prevID !== row["ID"]) {
					await setFilter(row, filters);
					prevID = row["ID"];
					if (info) console.log("Filtre eklendi:", row["ID"]);
				}
				if (options.setTable) {
					if (prevCode !== row["MALZEME KODU"] || index === last) {
						await setProductTable();
						prevCode = row["MALZEME KODU"];
					}
					tableRows.push(row);
					if (info) console.log("Tablo eklendi");
				}
				if (options.setCategories) {
					await setProductCategory(row);
					if (info) console.log("Ürün kategorisi eklendi", "Satır: " + (index + 2));
				}
				counter.success++;
			} catch (e) {
				let errorMessage = "Hata: " + e + " lineNumber: " + (index + 2);
				fs.appendFile('log.txt', errorMessage + "\n", function (err) {
					if (err) return console.log(err);
				});
				if (info) console.log(errorMessage);
				counter.error++;
			}
			await writeLastLineNumber(index++);
		}
	}
	line();
	console.log("Başarılı Sonuç: ", counter.success);
	console.log("Hatalı Sonuç: ", counter.error);
	console.log("Toplam: ", counter.success + counter.error);
	console.timeEnd();
}

main();
