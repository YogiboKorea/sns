require('dotenv').config();
const express = require('express');
const multer = require('multer');
const ftp = require('ftp');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const { MongoClient, ObjectId } = require('mongodb');

const app = express();
const port = process.env.PORT || 8010;

app.use(cors());
app.use(express.json());

let db;

const MONGO_URI = 'mongodb+srv://admin:admin@cluster0.unz3ui3.mongodb.net/forum?retryWrites=true&w=majority';

// MongoDB 연결
MongoClient.connect(MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
    .then(client => {
        db = client.db('yogibo');
        console.log('MongoDB에 연결되었습니다.');

        // 서버 시작
        app.listen(port, () => {
            console.log(`Server is running on http://localhost:${port}`);
        });
    })
    .catch(err => {
        console.error('MongoDB 연결 오류:', err);
    });

const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir);
}

const generateUniqueFilename = (originalname) => {
    const timestamp = Date.now();
    const random = Math.floor(Math.random() * 1000);
    const ext = path.extname(originalname);
    return `${timestamp}-${random}${ext}`;
};

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
        const uniqueFilename = generateUniqueFilename(file.originalname);
        cb(null, uniqueFilename);
    }
});

const upload = multer({ storage: storage });

const ftpServer = 'yogibo.ftp.cafe24.com';
const ftpUsername = 'yogibo';
const ftpPassword = 'korea2024@@';

app.post('/upload', upload.array('files', 10), (req, res) => {
    const { text, member_id, password } = req.body;
    console.log('Files received:', req.files);
    console.log('Text received:', text);
    console.log('Member ID received:', member_id);
    console.log('Password received:', password);

    const fileMetaData = {
        text: text,
        member_id: member_id,
        remoteFilePaths: [],
        uploadDate: new Date(),
        replies: [],
        password: password
    };

    if (req.files && req.files.length > 0) {
        const client = new ftp();
        let uploadedFiles = [];

        client.on('ready', () => {
            console.log('FTP 연결');

            // 파일을 순차적으로 업로드하는 함수
            function uploadFileSequentially(index) {
                if (index >= req.files.length) {
                    // 모든 파일 업로드 완료 후, MongoDB에 저장
                    fileMetaData.remoteFilePaths = uploadedFiles;
                    db.collection('replay').insertOne(fileMetaData, (err, result) => {
                        if (err) {
                            console.error('MongoDB 저장 실패:', err);
                            return res.status(500).json({ error: 'MongoDB 저장 실패' });
                        }
                        res.status(200).json({ message: '파일 업로드 및 데이터베이스 저장 성공', file: fileMetaData });
                        client.end();
                    });
                    return;
                }

                const file = req.files[index];
                const localFilePath = file.path;
                const remoteFilePath = `/web/board/new/${file.filename}`;

                fs.readFile(localFilePath, (err, data) => {
                    if (err) {
                        console.error('파일 로드 실패:', err);
                        return res.status(500).json({ error: '파일 로드 실패' });
                    }

                    client.put(data, remoteFilePath, (err) => {
                        if (err) {
                            console.error('FTP 업로드 실패:', err);
                            return res.status(500).json({ error: 'FTP 업로드 실패' });
                        }

                        console.log(`파일 업로드 완료: ${remoteFilePath}`);
                        uploadedFiles.push(remoteFilePath);

                        fs.unlink(localFilePath, (err) => {
                            if (err) {
                                console.error('파일 삭제 실패:', err);
                                return res.status(500).json({ error: '파일 삭제 실패' });
                            }

                            // 다음 파일 업로드
                            uploadFileSequentially(index + 1);
                        });
                    });
                });
            }

            // 첫 번째 파일 업로드 시작
            uploadFileSequentially(0);
        });

        client.on('error', (err) => {
            console.error('FTP client error:', err);
            res.status(500).json({ error: 'FTP client error', details: err.message });
        });

        console.log('Connecting to FTP server');
        client.connect({
            host: ftpServer,
            user: ftpUsername,
            password: ftpPassword
        });
    } else {
        // 파일이 없을 경우 텍스트만 저장
        db.collection('replay').insertOne(fileMetaData, (err, result) => {
            if (err) {
                console.error('MongoDB 저장 실패:', err);
                return res.status(500).json({ error: 'MongoDB 저장 실패' });
            }
            res.status(200).json({ message: '데이터베이스 저장 성공', file: fileMetaData });
        });
    }
});

// 댓글 데이터 가져오기
app.get('/replay', (req, res) => {
    console.log('Fetching replay data');
    db.collection('replay').find({}, { projection: { text: 1, member_id: 1, remoteFilePaths: 1, uploadDate: 1, replies: 1 } }).sort({ uploadDate: -1 }).toArray((err, reviews) => {
        if (err) {
            console.error('MongoDB 조회 실패:', err);
            return res.status(500).json({ error: 'MongoDB 조회 실패' });
        }
        console.log('Replay data fetched:', reviews);
        res.status(200).json(reviews);
    });
});

// 댓글 수정하기
app.put('/replay/:id', upload.array('files', 20), (req, res) => {
    const commentId = req.params.id;
    const { text, deletedImages, password } = req.body;

    db.collection('replay').findOne({ _id: new ObjectId(commentId) }, (err, review) => {
        if (err || !review) {
            console.error('댓글 조회 실패:', err);
            return res.status(404).json({ error: '댓글을 찾을 수 없습니다.' });
        }

        // 비회원의 경우 비밀번호 일치 확인 (yogibo 계정은 제외)
        if (review.member_id !== 'yogibo' && !review.member_id && review.password !== password) {
            console.error('비밀번호 불일치');
            return res.status(403).json({ error: '비밀번호가 일치하지 않습니다.' });
        }

        if (deletedImages && deletedImages.length > 0) {
            const deletedImageIndexes = JSON.parse(deletedImages);
            deletedImageIndexes.forEach(imageIndex => {
                review.remoteFilePaths[imageIndex] = null;
            });
            review.remoteFilePaths = review.remoteFilePaths.filter(filePath => filePath !== null);
        }

        if (req.files && req.files.length > 0) {
            const client = new ftp();
            let uploadedFiles = [];

            client.on('ready', () => {
                console.log('FTP 연결');
                let uploadCount = 0;

                req.files.forEach((file, index) => {
                    const localFilePath = file.path;
                    const remoteFilePath = `/web/board/new/${file.filename}`;

                    fs.readFile(localFilePath, (err, data) => {
                        if (err) {
                            console.error('파일 로드 실패:', err);
                            return res.status(500).json({ error: '파일 로드 실패' });
                        }

                        client.put(data, remoteFilePath, (err) => {
                            if (err) {
                                console.error('FTP 업로드 실패:', err);
                                return res.status(500).json({ error: 'FTP 업로드 실패' });
                            }

                            console.log(`파일 업로드 완료: ${remoteFilePath}`);
                            uploadedFiles.push(remoteFilePath);

                            fs.unlink(localFilePath, (err) => {
                                if (err) {
                                    console.error('파일 삭제 실패:', err);
                                    return res.status(500).json({ error: '파일 삭제 실패' });
                                }

                                uploadCount++;
                                if (uploadCount === req.files.length) {
                                    review.remoteFilePaths.push(...uploadedFiles);
                                    updateCommentInDb();
                                }
                            });
                        });
                    });
                });
            });

            client.on('error', (err) => {
                console.error('FTP client error:', err);
                res.status(500).json({ error: 'FTP client error', details: err.message });
            });

            console.log('Connecting to FTP server');
            client.connect({
                host: ftpServer,
                user: ftpUsername,
                password: ftpPassword
            });

            function updateCommentInDb() {
                const updatedComment = {
                    $set: {
                        text: text,
                        remoteFilePaths: review.remoteFilePaths
                    }
                };

                db.collection('replay').updateOne({ _id: new ObjectId(commentId) }, updatedComment, (err, result) => {
                    if (err) {
                        console.error('댓글 수정 실패:', err);
                        return res.status(500).json({ error: '댓글 수정 실패' });
                    }
                    res.status(200).json({ message: '댓글 수정 성공' });
                });
            }
        } else {
            const updatedComment = {
                $set: {
                    text: text,
                    remoteFilePaths: review.remoteFilePaths
                }
            };

            db.collection('replay').updateOne({ _id: new ObjectId(commentId) }, updatedComment, (err, result) => {
                if (err) {
                    console.error('댓글 수정 실패:', err);
                    return res.status(500).json({ error: '댓글 수정 실패' });
                }
                res.status(200).json({ message: '댓글 수정 성공' });
            });
        }
    });
});

// 댓글 삭제하기
app.delete('/replay/:id', (req, res) => {
    const commentId = req.params.id;
    const { password } = req.body;
    const userIdFromHeader = req.headers['x-user-id'];

    db.collection('replay').findOne({ _id: new ObjectId(commentId) }, (err, review) => {
        if (err || !review) {
            console.error('댓글 조회 실패:', err);
            return res.status(404).json({ error: '댓글을 찾을 수 없습니다.' });
        }

        // 'yogibo' 계정 또는 해당 댓글의 작성자가 요청한 경우
        if (userIdFromHeader === 'yogibo' || review.member_id === userIdFromHeader) {
            // 회원이거나 'yogibo' 계정이면 비밀번호 검증 없이 삭제 가능
            db.collection('replay').deleteOne({ _id: new ObjectId(commentId) }, (err, result) => {
                if (err) {
                    console.error('댓글 삭제 실패:', err);
                    return res.status(500).json({ error: '댓글 삭제 실패' });
                }
                res.status(200).json({ message: '댓글 삭제 성공' });
            });
        } else if (review.member_id === '' && review.password === password) {
            // 비회원의 경우 비밀번호 일치 시 삭제 가능
            db.collection('replay').deleteOne({ _id: new ObjectId(commentId) }, (err, result) => {
                if (err) {
                    console.error('댓글 삭제 실패:', err);
                    return res.status(500).json({ error: '댓글 삭제 실패' });
                }
                res.status(200).json({ message: '댓글 삭제 성공' });
            });
        } else {
            console.error('비밀번호 불일치 또는 권한 없음');
            return res.status(403).json({ error: '비밀번호가 일치하지 않거나 권한이 없습니다.' });
        }
    });
});

// 대댓글 작성하기
app.post('/replay/:id/reply', (req, res) => {
    const commentId = req.params.id;
    const { text, member_id } = req.body;
    const reply = {
        _id: new ObjectId(),
        text: text,
        member_id: member_id,
        uploadDate: new Date()
    };

    db.collection('replay').updateOne({ _id: new ObjectId(commentId) }, { $push: { replies: reply } }, (err, result) => {
        if (err) {
            console.error('대댓글 작성 실패:', err);
            return res.status(500).json({ error: '대댓글 작성 실패' });
        }
        res.status(200).json({ message: '대댓글 작성 성공', reply: reply });
    });
});

// 대댓글에 대한 답글 작성하기
app.post('/replay/:id/reply/:replyId', (req, res) => {
    const commentId = req.params.id;
    const replyId = req.params.replyId;
    const { text, member_id } = req.body;
    const nestedReply = {
        _id: new ObjectId(),
        text: text,
        member_id: member_id,
        uploadDate: new Date()
    };

    db.collection('replay').findOne({ _id: new ObjectId(commentId) }, (err, review) => {
        if (err || !review) {
            console.error('댓글 조회 실패:', err);
            return res.status(404).json({ error: '댓글을 찾을 수 없습니다.' });
        }

        const replyIndex = review.replies.findIndex(reply => reply._id.equals(new ObjectId(replyId)));
        if (replyIndex === -1) {
            console.error('대댓글 조회 실패');
            return res.status(404).json({ error: '대댓글을 찾을 수 없습니다.' });
        }

        if (!review.replies[replyIndex].replies) {
            review.replies[replyIndex].replies = [];
        }

        review.replies[replyIndex].replies.push(nestedReply);

        db.collection('replay').updateOne({ _id: new ObjectId(commentId) }, { $set: { replies: review.replies } }, (err, result) => {
            if (err) {
                console.error('대댓글에 대한 답글 작성 실패:', err);
                return res.status(500).json({ error: '대댓글에 대한 답글 작성 실패' });
            }
            res.status(200).json({ message: '대댓글에 대한 답글 작성 성공', nestedReply: nestedReply });
        });
    });
});

// 대댓글 삭제하기
app.delete('/replay/:commentId/reply/:replyId', (req, res) => {
    const commentId = req.params.commentId;
    const replyId = req.params.replyId;
    const { password } = req.body;

    db.collection('replay').findOne({ _id: new ObjectId(commentId) }, (err, review) => {
        if (err || !review) {
            console.error('댓글 조회 실패:', err);
            return res.status(404).json({ error: '댓글을 찾을 수 없습니다.' });
        }

        const reply = review.replies.find(r => r._id.equals(new ObjectId(replyId)));

        // 비회원의 경우 비밀번호 일치 확인 (yogibo 계정은 제외)
        if (reply.member_id !== 'yogibo' && !reply.member_id && reply.password !== password) {
            console.error('비밀번호 불일치');
            return res.status(403).json({ error: '비밀번호가 일치하지 않습니다.' });
        }

        db.collection('replay').updateOne({ _id: new ObjectId(commentId) }, { $pull: { replies: { _id: new ObjectId(replyId) } } }, (err, result) => {
            if (err) {
                console.error('대댓글 삭제 실패:', err);
                return res.status(500).json({ error: '대댓글 삭제 실패' });
            }
            res.status(200).json({ message: '대댓글 삭제 성공' });
        });
    });
});

app.delete('/replay/:commentId/reply/:replyId/nested-reply/:nestedReplyId', (req, res) => {
    const commentId = req.params.commentId;
    const replyId = req.params.replyId;
    const nestedReplyId = req.params.nestedReplyId;
    const { password } = req.body;

    db.collection('replay').findOne({ _id: new ObjectId(commentId) }, (err, review) => {
        if (err || !review) {
            console.error('댓글 조회 실패:', err);
            return res.status(404).json({ error: '댓글을 찾을 수 없습니다.' });
        }

        // 올바른 대댓글(reply)를 찾습니다.
        const reply = review.replies.find(r => r._id.equals(new ObjectId(replyId)));
        if (!reply) {
            console.error('대댓글 조회 실패');
            return res.status(404).json({ error: '대댓글을 찾을 수 없습니다.' });
        }

        // 올바른 중첩된 대댓글(nestedReply)를 찾습니다.
        const nestedReplyIndex = reply.replies.findIndex(nr => nr._id.equals(new ObjectId(nestedReplyId)));
        if (nestedReplyIndex === -1) {
            console.error('중첩 대댓글 조회 실패');
            return res.status(404).json({ error: '중첩 대댓글을 찾을 수 없습니다.' });
        }

        // 권한 확인 (회원 및 비회원)
        const nestedReply = reply.replies[nestedReplyIndex];
        const isAuthorized = (req.headers['x-user-id'] === 'yogibo' || nestedReply.member_id === req.headers['x-user-id']);
        const isPasswordMatch = (nestedReply.member_id === '' && nestedReply.password === password);

        if (isAuthorized || isPasswordMatch) {
            // 대댓글 배열에서 해당 대댓글을 제거
            reply.replies.splice(nestedReplyIndex, 1);

            // 변경된 대댓글 목록을 업데이트
            db.collection('replay').updateOne(
                { _id: new ObjectId(commentId), 'replies._id': new ObjectId(replyId) },
                { $set: { 'replies.$.replies': reply.replies } },
                (err, result) => {
                    if (err) {
                        console.error('중첩 대댓글 삭제 실패:', err);
                        return res.status(500).json({ error: '중첩 대댓글 삭제 실패' });
                    }
                    res.status(200).json({ message: '중첩 대댓글 삭제 성공' });
                }
            );
        } else {
            console.error('비밀번호 불일치 또는 권한 없음');
            return res.status(403).json({ error: '비밀번호가 일치하지 않거나 권한이 없습니다.' });
        }
    });
});
