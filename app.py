from flask import Flask, request, send_file, make_response, render_template
import os
import json
import requests
app = Flask(__name__, template_folder='.', static_url_path='/', static_folder='./')

@app.route('/')
def main():
    return render_template(
        'index.html'
    )
    
@app.route('/notion', methods=['POST'])
def send_to_notion():
    if request.method == 'POST':
        data = request.get_json()
        endpoint = "https://api.notion.com/v1/pages"
        secret = data["secret"]
        pay_load = json.loads(data["pay_load"])
        headers = {
                    'Authorization': 'Bearer '+secret,
                    'Content-Type': 'application/json',
                    'Notion-Version': '2022-06-28'
                  }
        r = requests.post(endpoint, json=pay_load, headers=headers)
        return r.text
    else:
        return "Method not allowed", 400
        
@app.route('/book', methods=['GET'])
def get_book_info():
    ISBN = request.args.get('isbn', '')
    if ISBN != '':
        URL = 'https://www.googleapis.com/books/v1/volumes?q=isbn:'+ISBN
        r = requests.get(URL)
        return r.text
    else:
        return "No ISBN specified", 400
        
@app.route('/file', methods=['GET'])
def get_file():
    file_url = request.args.get('url', '')
    if file_url != '':
        r = requests.get(file_url)
        response = make_response(r.content)
        response.headers.set('Content-Type', 'image/jpeg')
        response.headers.set(
            'Content-Disposition', 'attachment', filename='cover.jpg')
        return response
    else:
        return "No URL specified", 400

if __name__ == '__main__':
    app.run(host = "0.0.0.0", port = 8888, ssl_context='adhoc')
   