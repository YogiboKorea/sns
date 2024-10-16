const express = require('express');
const { MongoClient } = require('mongodb');
const bodyParser = require('body-parser');
const cors = require('cors');
const multer = require('multer');
const ftp = require('ftp');

// Express App 생성
const app = express();
app.use(bodyParser.json());
app.use(cors({ origin: '*' })); 


// MongoDB 연결 설정 (직접 URI 입력)
const mongoClient = new MongoClient('mongodb+srv://admin:admin@cluster0.unz3ui3.mongodb.net/forum?retryWrites=true&w=majority', { 
    useNewUrlParser: true, 
    useUnifiedTopology: true 
});
let db;

// MongoDB 연결
mongoClient.connect()
    .then(client => {
        db = client.db('yogibo');  // 사용할 DB 선택
        console.log('MongoDB 연결 성공');
    })
    .catch(err => console.error('MongoDB 연결 실패:', err));

// Multer 설정 (이미지 업로드를 위한 미들웨어)
const storage = multer.memoryStorage();  // 메모리에 파일 저장
const upload = multer({ storage: storage });

// FTP 서버 설정 (직접 FTP 설정 입력)
const ftpClient = new ftp();
const ftpConfig = {
    host: 'yogibo.ftp.cafe24.com',  // FTP 호스트
    user: 'yogibo',  // FTP 사용자명
    password: 'korea2024@@'  // FTP 비밀번호
};
// 상품 저장 API (이미지 포함)
app.post('/save-product', upload.single('image'), async (req, res) => {
    try {
        const products = JSON.parse(req.body.products); // products 배열 데이터 파싱
        const imageFile = req.file; // 업로드된 이미지 파일

        // FTP 서버에 이미지 업로드
        ftpClient.connect(ftpConfig);
        ftpClient.on('ready', () => {
            const remotePath = `/web/img/sns/${Date.now()}_${imageFile.originalname}`;
            ftpClient.put(imageFile.buffer, remotePath, async (err) => {
                if (err) {
                    console.error('FTP 업로드 오류:', err);
                    res.status(500).json({ success: false, message: 'FTP 업로드 오류' });
                    return;
                }

                // MongoDB에 저장할 데이터 준비
                const newDocument = {
                    imagePath: `/${remotePath}`, // 이미지 경로
                    products, // 제품 배열 (여러 제품 포함)
                };

                // MongoDB에 문서 저장
                const result = await db.collection('products').insertOne(newDocument);

                ftpClient.end();
                res.json({ success: true, document: result.ops[0] }); // 성공 응답
            });
        });
    } catch (err) {
        console.error('상품 저장 오류:', err);
        res.status(500).json({ success: false, message: '상품 저장 오류' });
    }
});

// 저장된 상품 목록 불러오기 API
app.get('/get-products', async (req, res) => {
    try {
        const products = await db.collection('products').find().toArray();
        res.json({ success: true, products });
    } catch (err) {
        console.error('상품 불러오기 오류:', err);
        res.status(500).json({ success: false, message: '상품 불러오기 오류' });
    }
});

// 서버 실행
app.listen(4000, () => {
    console.log('서버가 4000번 포트에서 실행 중...');
});