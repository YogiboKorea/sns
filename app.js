const express = require('express');
const { MongoClient } = require('mongodb');
const bodyParser = require('body-parser');
const cors = require('cors');
const multer = require('multer');
const ftp = require('ftp');
require('dotenv').config();

// Express App 생성
const app = express();
app.use(bodyParser.json());
app.use(cors({
    origin: '*', // '*' 대신 특정 출처를 지정하는 것이 좋습니다.
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    credentials: true // 쿠키 등을 포함한 인증 관련 요청 허용
}));

// MongoDB 연결 설정 (직접 URI 입력)
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
    host: process.env.FTP_HOST,  // FTP 호스트
    user: process.env.FTP_USER,  // FTP 사용자명
    password: process.env.FTP_PASSWORD  // FTP 비밀번호
};

// 상품 저장 API (이미지 포함)
app.post('/save-product', upload.single('image'), async (req, res) => {
    try {
        const products = JSON.parse(req.body.products); // products 배열 데이터 파싱
        const imageFile = req.file; // 업로드된 이미지 파일

        // 기존 문서에서 같은 이미지가 있는지 확인 (이미지 경로로 체크)
        const existingDocument = await db.collection('products').findOne({ imagePath: { $regex: imageFile.originalname } });

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

                if (existingDocument) {
                    // 이미지가 이미 존재하는 경우 기존 문서에 제품 배열을 추가
                    await db.collection('products').updateOne(
                        { _id: existingDocument._id }, // 기존 문서 업데이트
                        { $push: { products: { $each: products } } } // 새로운 products 추가
                    );
                    res.json({ success: true, message: '기존 이미지에 제품이 추가되었습니다.' });
                } else {
                    // 새 이미지의 경우 새 문서 삽입
                    const newDocument = {
                        imagePath: `${remotePath}`, // 이미지 경로
                        products, // 제품 배열
                    };

                    // MongoDB에 문서 저장
                    const result = await db.collection('products').insertOne(newDocument);

                    res.json({ success: true, documentId: result.insertedId }); // 성공 응답, 삽입된 문서의 ID 반환
                }

                ftpClient.end(); // FTP 연결 종료
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
