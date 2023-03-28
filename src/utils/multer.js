'use strict';

const Multer = require('multer');
const MulterS3 = require('multer-s3');
const Minio = require('./minio');

const upload = Multer({
	storage: MulterS3({
		s3: Minio.minioClient,
		bucket: 'oneauth-assets',
		contentType: MulterS3.AUTO_CONTENT_TYPE,
		key(request, file, callback) {
			const srvFileName = `user${
				request.user.id
			}_${Date.now()}.${file.originalname.split('.').pop()}`;
			callback(null, srvFileName);
		},
	}),
	limits: {
		fileSize: 2000000,
	},
});

function deleteMinio(key) {
	Minio.deleteObject('oneauth-assets', key);
}

module.exports = {
	upload,
	deleteMinio,
};
