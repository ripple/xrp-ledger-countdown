const countdown = require('countdown')
const CronJob = require('cron').CronJob;
const request = require('request-promise')
const Slack = require('slack-node');

var slack = new Slack();
slack.setWebhook(process.env['WEBHOOK_URI']);

const RIPPLED_RPC = process.env['ALTNET'] ? 'https://s.altnet.rippletest.net:51234' : 'https://s1.ripple.com:51234'

const VL_SITE = process.env['ALTNET'] ? 'vl.altnet.rippletest.net' : 'vl.ripple.com'

const RIPPLE_EPOCH = 946684800
const TWO_WEEKS = 1209600

function parseRippleTime(time) {
  return new Date((time + RIPPLE_EPOCH) * 1000)
}

function messageSlack (message) {
  console.log(message)
  slack.webhook({
    text: message
  }, function(err, response) {
    if (err)
      console.log(err)
  })
}

function getAmendments() {
  return request({
    method: 'POST',
    uri: RIPPLED_RPC,
    json:true,
    body: {
      method: 'ledger_entry',
      params: [{
        index: '7DB0788C020F02780A673DC74757F23823FA3014C1866E72CC4CD8B226CD6EF4',
        binary: false,
        ledger_index: 'validated'
      }]
    },
    resolveWithFullResponse: true
  }).then(resp => {
    return Promise.resolve(resp.body.result.node)
  })
}

function reportAmendmentTimes() {
  return getAmendments().then(amendments => {
    const now = Date.now()
    if (amendments.Majorities) {
      for (const majority of amendments.Majorities) {
        const time = countdown(now, parseRippleTime(majority.Majority.CloseTime + TWO_WEEKS)).toString()
        messageSlack('Amendment `' + majority.Majority.Amendment + '` will be enabled in *' + time + '* if majority holds')
      }
    }
  })
}

function getValidatorList() {
  return request.get({
    url: 'https://' + VL_SITE,
    json: true
  }).then(data => {
    return Promise.resolve(data)
  })
}

function reportValListExpiration () {
  return getValidatorList().then(data => {
    const now = Date.now()
    const valList = JSON.parse(new Buffer(data.blob, 'base64').toString('ascii'))
    const time = countdown(now, parseRippleTime(valList.expiration)).toString()
    messageSlack('Current validator list at `' + VL_SITE + '` will expire in *' + time + '*')
  })
}

const countdownCron = new CronJob({
  cronTime: '00 00 9 * * *',
  onTick: function() {
    reportAmendmentTimes()
    reportValListExpiration()    
  },
  start: true,
  timeZone: 'America/Los_Angeles'
});
