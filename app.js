const express = require('express');
const { MongoClient, ObjectId } = require('mongodb'); // ObjectId를 MongoClient에서 가져옴
const bodyParser = require('body-parser');
const cors = require('cors');
const multer = require('multer');
const ftp = require('ftp');
const crypto = require('crypto');
require('dotenv').config();

const app = express();
app.use(bodyParser.json());
app.use(cors({
    origin: '*',
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
}));

const mongoClient = new MongoClient(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
});
let db;

mongoClient.connect()
    .then(client => {
        db = client.db('yogibo');
        console.log('MongoDB 연결 성공');
    })
    .catch(err => console.error('MongoDB 연결 실패:', err));

const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

const ftpClient = new ftp();
const ftpConfig = {
    host: process.env.FTP_HOST,
    user: process.env.FTP_USER,
    password: process.env.FTP_PASSWORD,
};

const uploadToFTP = (fileBuffer, remotePath) => {
    return new Promise((resolve, reject) => {
        console.log('FTP 서버 연결 중...');
        ftpClient.connect(ftpConfig);
        ftpClient.on('ready', () => {
            console.log('FTP 연결 성공');
            ftpClient.put(fileBuffer, remotePath, (err) => {
                if (err) {
                    console.error('FTP 업로드 오류:', err);
                    reject('FTP 업로드 오류: ' + err);
                } else {
                    console.log('FTP 업로드 성공:', remotePath);
                    resolve('FTP 업로드 성공');
                }
                ftpClient.end();
            });
        });
        ftpClient.on('error', (err) => {
            console.error('FTP 연결 오류:', err);
            reject('FTP 연결 오류: ' + err);
        });
    });
};

// 큰 화면 이미지 저장
app.post('/save-big-image', upload.single('image'), async (req, res) => {
    try {
        const products = JSON.parse(req.body.products || '[]'); // 상품 정보가 없으면 빈 배열로 처리
        const imageFile = req.file;

        if (!imageFile) {
            return res.status(400).json({ success: false, message: '이미지 파일이 없습니다.' });
        }

        const randomString = crypto.randomBytes(16).toString('hex');
        const fileExtension = imageFile.originalname.split('.').pop();
        const remotePath = `/web/img/sns/big/${Date.now()}_${randomString}.${fileExtension}`;

        console.log('FTP 업로드 경로:', remotePath);

        // FTP 업로드
        try {
            await uploadToFTP(imageFile.buffer, remotePath);
            console.log('FTP 업로드 성공');
        } catch (ftpErr) {
            console.error('FTP 업로드 오류:', ftpErr);
            return res.status(500).json({ success: false, message: 'FTP 업로드 오류' });
        }

        // MongoDB 업데이트
        const existingBigImage = await db.collection('big_images').findOne({});
        if (existingBigImage) {
            console.log('기존 큰화면 이미지 업데이트');
            await db.collection('big_images').updateOne(
                { _id: existingBigImage._id },
                { $set: { imagePath: remotePath, products, updatedAt: new Date() } }
            );
        } else {
            console.log('새로운 큰화면 이미지 추가');
            await db.collection('big_images').insertOne({
                imagePath: remotePath,
                products,
                createdAt: new Date(),
            });
        }

        res.json({ success: true, imagePath: remotePath });
    } catch (err) {
        console.error('큰화면 이미지 저장 오류:', err);
        res.status(500).json({ success: false, message: '큰화면 이미지 저장 오류' });
    }
});

// 큰 화면 이미지 및 관련 상품 정보 불러오기
app.get('/get-big-image', async (req, res) => {
    try {
        const bigImage = await db.collection('big_images').findOne({}, { sort: { createdAt: -1 } });

        if (bigImage) {
            res.json({ success: true, imagePath: bigImage.imagePath, products: bigImage.products });
        } else {
            res.json({ success: false, message: '큰 화면 이미지가 존재하지 않습니다.' });
        }
    } catch (err) {
        console.error('큰화면 이미지 불러오기 오류:', err);
        res.status(500).json({ success: false, message: '큰화면 이미지 불러오기 오류' });
    }
});

// 상품 정보 저장
app.post('/save-product', upload.single('image'), async (req, res) => {
    try {
        const products = JSON.parse(req.body.products);
        const imageFile = req.file;

        if (!imageFile) {
            throw new Error('이미지 파일이 없습니다.');
        }

        const randomString = crypto.randomBytes(16).toString('hex');
        const fileExtension = imageFile.originalname.split('.').pop();
        const remotePath = `/web/img/sns/${Date.now()}_${randomString}.${fileExtension}`;

        const existingDocument = await db.collection('products').findOne({ imagePath: { $regex: randomString } });

        try {
            await uploadToFTP(imageFile.buffer, remotePath);
        } catch (ftpErr) {
            console.error('FTP 오류:', ftpErr);
            return res.status(500).json({ success: false, message: ftpErr });
        }

        if (existingDocument) {
            await db.collection('products').updateOne(
                { _id: existingDocument._id },
                { $push: { products: { $each: products } } }
            );
            res.json({ success: true, message: '기존 이미지에 제품이 추가되었습니다.' });
        } else {
            const newDocument = {
                imagePath: remotePath,
                products,
            };
            const result = await db.collection('products').insertOne(newDocument);
            res.json({ success: true, documentId: result.insertedId });
        }
    } catch (err) {
        console.error('상품 저장 오류:', err);
        res.status(500).json({ success: false, message: '상품 저장 오류' });
    }
});

// 저장된 상품 정보 가져오기
app.get('/get-products', async (req, res) => {
    const { limit = 12, skip = 0 } = req.query;
    try {
        const products = await db.collection('products')
            .find()
            .sort({ _id: -1 })
            .skip(parseInt(skip))
            .limit(parseInt(limit))
            .toArray();
        res.json({ success: true, products });
    } catch (err) {
        console.error('상품 불러오기 오류:', err);
        res.status(500).json({ success: false, message: '상품 불러오기 오류' });
    }
});

// 상품 삭제
app.delete('/delete-product/:id', async (req, res) => {
    const productId = req.params.id;
    try {
        const result = await db.collection('products').deleteOne({ _id: new ObjectId(productId) });
        if (result.deletedCount === 1) {
            res.json({ success: true });
        } else {
            res.json({ success: false, message: '삭제 실패' });
        }
    } catch (err) {
        console.error('상품 삭제 오류:', err);
        res.status(500).json({ success: false, message: '상품 삭제 오류' });
    }
});

// 서버 실행
app.listen(4000, () => {
    console.log('서버가 4000번 포트에서 실행 중...');
});
