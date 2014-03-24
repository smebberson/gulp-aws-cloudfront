
var Stream = require('stream'),
	aws = require('aws-sdk'),
	gutil = require('gulp-util'),
	uuid = require('node-uuid'),
	pad = require('pad');

function CloudFront (awsCredentials) {

	this.credentials = awsCredentials;

	if (typeof awsCredentials !== 'object') {
		throw new gutil.PluginError('gulp-aws-cloudfront', {
			message: 'You must pass an object containing the correct credentials'
		});
	}

	try {

		aws.config.update(awsCredentials);

	} catch (e) {

		throw new gutil.PluginError('gulp-aws-cloudfront', {
			message: 'Failed to set AWS credentials.'
		});

	}

}

CloudFront.prototype.invalidate = function (options) {

	var toInvalidate = [],
		// can't use through2 here, because we want to use _flush
		stream = new Stream.Transform({ objectMode : true }),
		_self = this;

	options = options || {};
	options.states = options.states || ['update'];

	if (!options.id) {
		throw new gutil.PluginError('gulp-aws-cloudfront', {
			message: 'You need to pass in the cloudfront distribution id.'
		});
	}

	stream._transform = function (file, enc, cb) {

		if (options.states && options.states.indexOf(file.s3.state) === -1) {
			return cb();
		}

		toInvalidate.push(file);

		cb();

	};

	stream._flush = function (cb) {

		if (!toInvalidate.length) {
			return cb();
		}

		var cloudfrontClient = new aws.CloudFront(),
			params = {
				'DistributionId': options.id,
				'InvalidationBatch': {
					'CallerReference': uuid.v4(),
					'Paths': {
						'Quantity': 0,
						'Items': []
					}
				}
			},
			_self = this;

		// loop through each file to invalidate
		toInvalidate.forEach(function (file) {

			params.InvalidationBatch.Paths.Quantity++;
			params.InvalidationBatch.Paths.Items.push(((file.s3.path.indexOf('/') !== 0) ? '/' : '') + file.s3.path);

		});

		// create the invalidation with cloudfront
		cloudfrontClient.createInvalidation(params, function (err, result) {

			// if that was an error, emit it and stop processing
			if (err) {
				_self.emit('error', err);
				return cb();
			}

			// Log the invalidation and the paths invalidated
			gutil.log('Created invalidation ' + gutil.colors.cyan(result.Id) + ' for: ');

			result.InvalidationBatch.Paths.Items.forEach(function (file) {

				gutil.log(pad(6, file));

			});

			return cb();


		});

	};

	return stream;

};

// return a new instance of CloudFront
exports.create = function (awsCredentials) {
	return new CloudFront(exports.updateCredentials(awsCredentials));
};

// this plugin has been designed to work with gulp-awspublish
// gulp-awspublish however uses knox where as gulp-aws-cloudfront uses aws-sdk
// this method takes the credentials object format required for knox and converts to that required of aws-sdk
exports.updateCredentials = function (awsCredentials) {

	if (!awsCredentials.accessKeyId && awsCredentials.key) {
		awsCredentials.accessKeyId = awsCredentials.key;
	}

	if (!awsCredentials.secretAccessKey && awsCredentials.secret) {
		awsCredentials.secretAccessKey = awsCredentials.secret;
	}

	return awsCredentials;

};