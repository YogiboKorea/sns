const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const cors = require('cors');
const multer = require('multer');
const ftp = require('ftp');
const path = require('path');
require('dotenv').config();  // .env 파일 로드

// Express App 생성
const app = express();
app.use(bodyParser.json());
app.use(cors());  // CORS 허용

// MongoDB 연결 (환경 변수로 URI 설정)
mongoose.connect(process.env.MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
    .then(() => console.log('MongoDB 연결 성공'))
    .catch(err => console.error('MongoDB 연결 실패:', err));

// Mongoose Schema 및 모델 정의
const productSchema = new mongoose.Schema({
    product_name: String,
    price: String,
    product_no: String,
    position: { x: Number, y: Number },
    imagePath: String // FTP 서버에 저장된 이미지 경로
});

const Product = mongoose.model('Product', productSchema);

// Multer 설정 (이미지 업로드를 위한 미들웨어)
const storage = multer.memoryStorage(); // 메모리에 파일 저장
const upload = multer({ storage: storage });

// FTP 서버 설정 (환경 변수 사용)
const ftpClient = new ftp();
const ftpConfig = {
    host: process.env.FTP_HOST,
    user: process.env.FTP_USER,
    password: process.env.FTP_PASSWORD
};

// 상품 저장 API (이미지 포함)
app.post('/save-product', upload.single('image'), async (req, res) => {
    try {
        const { products } = req.body;
        const imageFile = req.file;  // 업로드된 이미지 파일
        const savedProducts = [];

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

                // FTP 서버에서 이미지 파일 경로를 MongoDB에 저장
                for (let product of products) {
                    const newProduct = new Product({
                        product_name: product.product_name,
                        price: product.price,
                        product_no: product.product_no,
                        position: product.position,
                        imagePath: `/${remotePath}`  // 이미지 경로 저장
                    });
                    const savedProduct = await newProduct.save();
                    savedProducts.push(savedProduct);
                }

                ftpClient.end();
                res.json({ success: true, products: savedProducts });
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
        const products = await Product.find();
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
