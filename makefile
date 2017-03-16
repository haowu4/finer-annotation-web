
init:
	npm install babel-preset-es2015
	echo '{"presets": ["es2015"]}' > .babelrc

deploy:
	babel script.js --out-file app.js

web:
	python -m http.server || python -m SimpleHTTPServer