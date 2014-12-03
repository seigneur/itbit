var querystring = require("querystring"),
    request = require("request"),
    VError = require('verror'),
    crypto = require("crypto"),
    util = require('util');

var self;

var ItBit = function ItBit(settings)
{
  self = this;

  this.key = settings.key;
  this.secret = settings.secret;

  this.serverV1 = settings.serverV1 || "https://api.itbit.com/v1";
  this.serverV2 = settings.serverV2 || "https://www.itbit.com/api/v2";
  this.timeout = settings.timeout || 5000;  // 5 seconds

  // initialize nonce to current unix time in seconds
  this.nonce = (new Date()).getTime();
};

function makePublicRequest(version, path, args, callback)
{
  var functionName = 'ItBit.makePublicRequest()';

  var params = querystring.stringify(args);
  if (params) path = path + "?" + params;

  var server;
  if (version === 'v1')
  {
    server = self.serverV1;
  }
  else if (version === 'v2')
  {
    server = self.serverV2;
  }
  else
  {
    var error = new VError('%s version %s needs to be either v1 or v2', functionName, version);
    return callback(error);
  }

  var options = {
    method: "GET",
    uri: server + path,
    headers: {
      "User-Agent": "itBit node.js client",
      "Content-type": "application/x-www-form-urlencoded"
    },
    json: args
  };

  executeRequest(options, callback);
};

function makePrivateRequest(method, path, args, callback)
{
  var functionName = "ItBit.makePrivateRequest()";

  if (!self.key || !self.secret)
  {
    return callback(new VError("%s must provide key and secret to make a private API request.", functionName))
  }

  var uri = self.serverV1 + path;

  // compute the post data
  var postData = "";
  if (method === 'POST' || method === 'PUT')
  {
    postData = JSON.stringify(args);
  }
  else if (method === "GET")
  {
    uri += "?" + querystring.stringify(args);
  }

  var timestamp = (new Date()).getTime();
  var nonce = self.nonce++;

  // message is concatenated string of nonce and JSON array of secret, method, uri, json_body, nonce, timestamp
  var message = nonce + JSON.stringify([method, uri, postData, nonce.toString(), timestamp.toString()]);

  var hash_digest = crypto
      .createHash("sha256")
      .update(message).
      digest("binary");

  var signer = crypto.createHmac("sha512", self.secret);

  var signature = signer
      .update(uri + hash_digest)
      .digest("base64");

  var options = {
    method: method,
    uri: uri,
    headers: {
      "User-Agent": "itBit node.js client",
      Authorization: self.key + ':' + signature,
      "X-Auth-Timestamp": timestamp,
      "X-Auth-Nonce": nonce
    },
    json: args,
    timeout: self.timeout
  };

  executeRequest(options,callback);
};

function executeRequest(options, callback)
{
  var functionName = 'ItBit.executeRequest()';

  request(options, function (err, res, body)
  {
    var json,
        requestDesc = util.format('%s request to url %s',
        options.method, options.uri);

    if (err)
    {
      var error = new VError(err, '%s failed %s', functionName, requestDesc);

      return callback(error);
    }
    else if (body && body.code)
    {
      var error = new VError('%s failed %s. Error code %s, description: %s', functionName,
          requestDesc, body.code, body.description);
      error.name = body.code;

      return callback(error);
    }
    else if (!(res.statusCode === 200 || res.statusCode === 201 || res.statusCode === 202))
    {
      var error = new VError('%s failed %s. Response status code %s, response body %s', functionName,
          requestDesc, res.statusCode, res.body);
      error.name = res.statusCode;

      return callback(error);
    }

    callback(null, body);
  });
};

ItBit.prototype.getOrderBook = function(tickerSymbol, callback)
{
  makePublicRequest('v2', "/markets/" + tickerSymbol + "/orders", {}, callback);
};

ItBit.prototype.getTicker = function(tickerSymbol, callback)
{
  makePublicRequest('v1', "/markets/" + tickerSymbol + "/ticker", {}, callback);
};

ItBit.prototype.getWallets = function(userId, callback)
{
  makePrivateRequest("GET", "/wallets", {userId: userId}, callback);
};

ItBit.prototype.getWallet = function(walletId, callback)
{
  makePrivateRequest("GET", "/wallets/" + walletId, {}, callback);
};

ItBit.prototype.getOrders = function(walletId, instrument, status, callback)
{
  var args = {
    instrument: instrument,
    status: status
  }

  makePrivateRequest("GET", "/wallets/" + walletId + "/orders", args, callback);
};

ItBit.prototype.getOrder = function(walletId, id, callback)
{
  makePrivateRequest("GET", "/wallets/" + walletId + "/orders/" + id, {}, callback);
};

// price is an optional argument, if not used it must be set to null
ItBit.prototype.addOrder = function(walletId, side, type, amount, price, instrument, metadata, clientOrderIdentifier, callback)
{
  var args = {
    side: side,
    type: type,
    currency: instrument.slice(0,3),
    amount: amount.toString(),
    price: price.toString(),
    instrument: instrument
  };

  if (metadata) {args.metadata = metadata;}
  if (clientOrderIdentifier) {args.clientOrderIdentifier = clientOrderIdentifier;}

  makePrivateRequest("POST", "/wallets/" + walletId + "/orders", args, callback);
};

ItBit.prototype.cancelOrder = function(walletId, id, callback)
{
  makePrivateRequest("DELETE", "/wallets/" + walletId + "/orders/" + id, {}, callback);
};

ItBit.prototype.trades = function(walletId, callback)
{
  makePrivateRequest("GET", "/wallets/" + walletId + "/trades", {}, callback);
};

ItBit.prototype.cryptocurrency_withdrawals = function(walletId, currency, amount, address, callback)
{
  var args = { currency: currency, amount: amount, address: address };

  makePrivateRequest("POST", "/wallets/" + walletId + '/cryptocurrency_withdrawals', args, callback);
};

ItBit.prototype.cryptocurrency_deposits = function(walletId, currency, callback)
{
  var args = { currency: currency };

  makePrivateRequest("POST", "/wallets/" + walletId + '/cryptocurrency_deposits', args, callback);
};

module.exports = ItBit;