const express = require('express');
const { MongoClient, ObjectId } = require('mongodb');  // ObjectId를 MongoClient에서 가져옴
const bodyParser = require('body-parser');
const cors = require('cors');
const multer = require('multer');
const ftp = require('ftp');
const crypto = require('crypto');
require('dotenv').config();

const app = express();

// 미들웨어 설정
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
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

app.post('/save-product', upload.single('image'), async (req, res) => {
    try {
        const products = JSON.parse(req.body.products);
        const imageFile = req.file;

        if (!imageFile) {
            throw new Error('이미지 파일이 없습니다.');
        }

        const randomString = crypto.randomBytes(16).toString('hex');
        const fileExtension = imageFile.originalname.split('.').pop();
        const remotePath = `/web/img/sns/${Date.now()}.${fileExtension}`;

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



app.get('/get-big-image', async (req, res) => {
    try {
        const bigImage = await db.collection('big_images').findOne({}, { sort: { createdAt: -1 } });

        if (bigImage) {
            res.json({ success: true, imagePath: bigImage.imagePath, products: bigImage.products });
        } else {
            res.json({ success: false, message: '큰 화면 이미지가 존재하지 않습니다.' });
        }
    } catch (err) {
        res.status(500).json({ success: false, message: '큰화면 이미지 불러오기 오류', error: err.message });
    }
});

app.post('/save-big-image', upload.single('image'), async (req, res) => {
    try {
        console.log('파일 업로드 요청 수신');
        const imageFile = req.file;
        if (!imageFile) {
            console.error('이미지 파일이 없습니다.');
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
                { $set: { imagePath: remotePath, updatedAt: new Date() } }
            );
        } else {
            console.log('새로운 큰화면 이미지 추가');
            await db.collection('big_images').insertOne({
                imagePath: remotePath,
                createdAt: new Date(),
            });
        }

        res.json({ success: true, imagePath: remotePath });
    } catch (err) {
        console.error('큰화면 이미지 저장 오류:', err);
        res.status(500).json({ success: false, message: '큰화면 이미지 저장 오류' });
    }
});

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
app.post('/upload-capture', async (req, res) => {
    try {
        const { image, memberId } = req.body;

        if (!image) {
            console.error('요청 데이터 누락: image');
            return res.status(400).json({ success: false, message: '요청 데이터 누락: image가 없습니다.' });
        }

        // 회원 아이디가 없는 경우 "null" 문자열로 설정
        const memberIdentifier = memberId || "null";

        // Base64 데이터를 버퍼로 변환
        const base64Data = image.replace(/^data:image\/png;base64,/, "");
        const fileBuffer = Buffer.from(base64Data, 'base64');

        // 파일 이름과 경로 설정
        const randomString = crypto.randomBytes(16).toString('hex');
        const remotePath = `/web/img/captures/${memberId || "null"}_${new Date().toLocaleString("ko-KR", {
            timeZone: "Asia/Seoul",
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
        }).replace(/[^0-9]/g, "")}.png`;

        // FTP 업로드
        await uploadToFTP(fileBuffer, remotePath);

        // MongoDB에 저장
        const captureData = {
            imagePath: remotePath,
            createdAt: new Date(),
            memberId: memberIdentifier,
            likes: 0,
            likedBy: [],
        };

        const result = await db.collection('captures').insertOne(captureData);
        res.json({ success: true, imagePath: remotePath, documentId: result.insertedId });
    } catch (err) {
        console.error('캡처 업로드 처리 오류:', err);
        res.status(500).json({ success: false, message: '캡처 업로드 처리 오류' });
    }
});






// 캡처 URL 조회 API
app.get('/get-captures', async (req, res) => {
    try {
        const { limit = 10, skip = 0 } = req.query; // 페이징 처리
        const captures = await db.collection('captures')
            .find()
            .sort({ createdAt: -1 }) // 최신 순 정렬
            .skip(parseInt(skip))
            .limit(parseInt(limit))
            .toArray();

        res.json({ success: true, captures });
    } catch (err) {
        console.error('캡처 조회 오류:', err);
        res.status(500).json({ success: false, message: '캡처 조회 오류' });
    }
});


app.get('/get-latest-capture', async (req, res) => {
    try {
        const latestCapture = await db.collection('captures').findOne({}, { sort: { createdAt: -1 } });
        if (latestCapture) {
            res.json({ success: true, imagePath: latestCapture.imagePath });
        } else {
            res.json({ success: false, message: '캡처된 이미지가 없습니다.' });
        }
    } catch (err) {
        console.error('최신 캡처 조회 오류:', err);
        res.status(500).json({ success: false, message: '최신 캡처 조회 오류' });
    }
});
//최신순서대로 이미지 가지고 오는 로직 추가
app.get('/get-images', async (req, res) => {
    try {
        const { limit = 10, skip = 0 } = req.query; // 페이징 지원
        const images = await db.collection('captures')
            .find()
            .sort({ createdAt: -1 }) // 최신순 정렬
            .skip(parseInt(skip))
            .limit(parseInt(limit))
            .toArray();

        res.json({ success: true, images });
    } catch (err) {
        console.error('이미지 데이터 불러오기 오류:', err);
        res.status(500).json({ success: false, message: '이미지 데이터를 불러오는 중 오류가 발생했습니다.' });
    }
});

app.post('/like-image', async (req, res) => {
    try {
        const { imageId, memberId } = req.body;

        if (!imageId || !memberId) {
            return res.status(400).json({ success: false, message: '잘못된 요청입니다.' });
        }

        // 이미지 데이터 가져오기
        const image = await db.collection('captures').findOne({ _id: new ObjectId(imageId) });
        if (!image) {
            return res.status(404).json({ success: false, message: '이미지를 찾을 수 없습니다.' });
        }

        // 이미 좋아요를 누른 회원인지 확인
        const isLiked = image.likedBy.includes(memberId);

        if (isLiked) {
            // 좋아요 취소
            const result = await db.collection('captures').updateOne(
                { _id: new ObjectId(imageId) },
                {
                    $inc: { likes: -1 }, // 좋아요 수 감소
                    $pull: { likedBy: memberId }, // likedBy 배열에서 사용자 제거
                }
            );

            if (result.modifiedCount === 1) {
                return res.json({ success: true, message: '좋아요가 취소되었습니다.', liked: false });
            }
        } else {
            // 좋아요 추가
            const result = await db.collection('captures').updateOne(
                { _id: new ObjectId(imageId) },
                {
                    $inc: { likes: 1 }, // 좋아요 수 증가
                    $push: { likedBy: memberId }, // likedBy 배열에 사용자 추가
                }
            );

            if (result.modifiedCount === 1) {
                return res.json({ success: true, message: '좋아요가 추가되었습니다!', liked: true });
            }
        }

        res.status(500).json({ success: false, message: '좋아요 처리 실패' });
    } catch (err) {
        console.error('좋아요 처리 오류:', err);
        res.status(500).json({ success: false, message: '좋아요 처리 중 오류가 발생했습니다.' });
    }
});

//순위별 데이터 가져오기
app.get('/get-top-images', async (req, res) => {
    try {
        // 좋아요 수 기준 내림차순, 같은 좋아요 수에서는 최신순
        const topImages = await db.collection('captures')
            .find()
            .sort({ likes: -1, createdAt: -1 }) // 좋아요 내림차순, 생성일 내림차순
            .limit(3) // 상위 3개만 가져오기
            .toArray();

        res.json({ success: true, images: topImages });
    } catch (err) {
        console.error('추천 이미지 불러오기 오류:', err);
        res.status(500).json({ success: false, message: '추천 이미지 불러오기 오류' });
    }
});
const ftpClient = require('ftp');

// FTP 삭제 함수
const deleteFromFTP = (filePath) => {
    return new Promise((resolve, reject) => {
        const client = new ftpClient();
        client.on('ready', () => {
            client.delete(filePath, (err) => {
                client.end();
                if (err) {
                    reject(`FTP 삭제 실패: ${filePath}`);
                } else {
                    resolve(`FTP 삭제 성공: ${filePath}`);
                }
            });
        });
        client.on('error', (err) => {
            reject(`FTP 연결 실패: ${err.message}`);
        });
        client.connect({
            host: process.env.FTP_HOST,
            user: process.env.FTP_USER,
            password: process.env.FTP_PASSWORD,
        });
    });
};

// 이미지 삭제 API
app.delete('/delete-images', async (req, res) => {
    const memberId = req.body.memberId; // 회원 ID를 요청에서 받음

    if (memberId !== 'yogibo') {
        return res.status(403).json({ success: false, message: '권한이 없습니다.' });
    }

    try {
        // MongoDB에서 이미지 데이터 가져오기
        const images = await db.collection('captures').find({ memberId }).toArray();

        if (images.length === 0) {
            return res.json({ success: true, message: '삭제할 이미지가 없습니다.' });
        }

        // MongoDB 및 FTP에서 이미지 삭제
        for (const image of images) {
            const filePath = image.imagePath;

            // FTP에서 이미지 삭제
            try {
                await deleteFromFTP(filePath);
                console.log(`FTP 삭제 성공: ${filePath}`);
            } catch (err) {
                console.error(`FTP 삭제 실패: ${filePath}`, err);
            }

            // MongoDB에서 이미지 문서 삭제
            await db.collection('captures').deleteOne({ _id: image._id });
            console.log(`MongoDB 삭제 성공: ${image._id}`);
        }

        res.json({ success: true, message: '모든 이미지가 성공적으로 삭제되었습니다.' });
    } catch (err) {
        console.error('이미지 삭제 중 오류:', err);
        res.status(500).json({ success: false, message: '이미지 삭제 중 오류가 발생했습니다.' });
    }
});


app.listen(4000, () => {
    console.log('서버가 4000번 포트에서 실행 중...');
});
