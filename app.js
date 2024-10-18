const express = require('express');
const { MongoClient } = require('mongodb');
const bodyParser = require('body-parser');
const cors = require('cors');
const multer = require('multer');
const ftp = require('ftp');
const crypto = require('crypto'); // 랜덤 문자열 생성을 위해 crypto 모듈 추가
require('dotenv').config();

// Express App 생성
const app = express();
app.use(bodyParser.json());
app.use(cors({
    origin: '*',
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
}));

// MongoDB 연결 설정
const mongoClient = new MongoClient(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
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

// FTP 서버 설정 (환경 변수로 관리)
const ftpClient = new ftp();
const ftpConfig = {
    host: process.env.FTP_HOST,
    user: process.env.FTP_USER,
    password: process.env.FTP_PASSWORD,
};

// FTP 업로드 함수
const uploadToFTP = (fileBuffer, remotePath) => {
    return new Promise((resolve, reject) => {
        ftpClient.connect(ftpConfig);
        ftpClient.on('ready', () => {
            ftpClient.put(fileBuffer, remotePath, (err) => {
                if (err) {
                    reject('FTP 업로드 오류: ' + err);
                } else {
                    resolve('FTP 업로드 성공');
                }
                ftpClient.end();
            });
        });
        ftpClient.on('error', (err) => {
            reject('FTP 연결 오류: ' + err);
        });
    });
};

// 상품 저장 API (이미지 포함)
app.post('/save-product', upload.single('image'), async (req, res) => {
    try {
        const products = JSON.parse(req.body.products); // products 배열 데이터 파싱
        const imageFile = req.file; // 업로드된 이미지 파일
        
        // 랜덤 파일명을 생성 (타임스탬프 + 랜덤 해시)
        const randomString = crypto.randomBytes(16).toString('hex');
        const fileExtension = imageFile.originalname.split('.').pop();  // 파일 확장자 추출
        const remotePath = `/web/img/sns/${Date.now()}_${randomString}.${fileExtension}`;  // 새로운 파일명

        // 기존 문서에서 같은 이미지가 있는지 확인 (이미지 경로로 체크)
        const existingDocument = await db.collection('products').findOne({ imagePath: { $regex: randomString } });

        // FTP 서버에 이미지 업로드
        try {
            await uploadToFTP(imageFile.buffer, remotePath);  // FTP 업로드 완료 후 계속 진행
        } catch (ftpErr) {
            console.error(ftpErr);
            return res.status(500).json({ success: false, message: ftpErr });
        }

        if (existingDocument) {
            // 이미지가 이미 존재하는 경우 기존 문서에 제품 배열을 추가
            await db.collection('products').updateOne(
                { _id: existingDocument._id },  // 기존 문서 업데이트
                { $push: { products: { $each: products } } }  // 새로운 products 추가
            );
            res.json({ success: true, message: '기존 이미지에 제품이 추가되었습니다.' });
        } else {
            // 새 이미지의 경우 새 문서 삽입
            const newDocument = {
                imagePath: remotePath,  // 이미지 경로
                products,  // 제품 배열
            };

            // MongoDB에 문서 저장
            const result = await db.collection('products').insertOne(newDocument);
            res.json({ success: true, documentId: result.insertedId });  // 성공 응답
        }
    } catch (err) {
        console.error('상품 저장 오류:', err);
        res.status(500).json({ success: false, message: '상품 저장 오류' });
    }
});

// 저장된 상품 목록 불러오기 API
app.get('/get-products', async (req, res) => {
    const { limit = 300, skip = 0 } = req.query;  // 페이지네이션을 위한 limit과 skip 값 설정
    try {
        const products = await db.collection('products')
            .find()
            .sort({ _id: -1 })  // 최근 순으로 정렬
            .skip(parseInt(skip))  // 건너뛸 항목 수
            .limit(parseInt(limit))  // 가져올 항목 수 제한
            .toArray();
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
