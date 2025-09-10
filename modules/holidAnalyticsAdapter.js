import adapter from '../libraries/analyticsAdapter/AnalyticsAdapter.js';
import adapterManager from '../src/adapterManager.js';
import { ajax } from '../src/ajax.js';
import { logInfo } from '../src/utils.js';
import { EVENTS } from '../src/constants.js';

const ANALYTICS_URL = 'https://analytics.holid.io/prebid/';
const END_POINT = "holid.php";

let holidAnalytics = Object.assign(adapter({url: ANALYTICS_URL, analyticsType: 'endpoint'}), {
  context: {},

  track({eventType, args}) {
      switch (eventType) {
        case EVENTS.AUCTION_INIT:
          logInfo('HOLID_AUCTION_INIT:', args);
          this.context[args.auctionId] = {
            auctionId: args.auctionId,
            startTime: args.timestamp,
            domain: "",
            bidRequests: [],
            bidResponses: [],
            bidRejected: [],
            bidderDone: [],
            bidTimeout: [],
            winningBids: [],
            adRenderFailed: []
          };
          break;

        case EVENTS.BID_REQUESTED:
          logInfo('HOLID_BID_REQUESTED:', args);
          if (this.context[args.auctionId]) {
            var newargs = {};
            newargs.bidderCode = args.bidderCode;            
            newargs.bidderRequestId = args.bidderRequestId;
            newargs.gdprConsent = null;
            if(args.gdprConsent) {
              newargs.gdprConsent = {
                "consentString" : args.gdprConsent.consentString ? true : false,
                "gdprApplies" : args.gdprConsent.gdprApplies,
              }
            }
            newargs.bids = [];
            args.bids.forEach(function(bidRequest) {
              newargs.bids.push({
                "bidderCode" : bidRequest.bidderCode,
                "bidId" : bidRequest.bidId,
                "adUnitCode" : bidRequest.adUnitCode,
                "transactionId" : bidRequest.transactionId,
              });
            });
            this.context[args.auctionId].domain ||= args.refererInfo.domain;
            this.context[args.auctionId].bidRequests.push(newargs);
          }
          break;

        case EVENTS.BID_RESPONSE:
          logInfo('HOLID_BID_RESPONSE:', args);
          if (this.context[args.auctionId]) {
            var newargs = {};
            newargs.bidder = args.bidder;
            newargs.adUnitCode = args.adUnitCode;
            newargs.requestId = args.requestId;
            newargs.adId = args.adId;
            newargs.mediaType = args.mediaType;
            newargs.ttl = args.ttl;
            newargs.source = args.source;
            newargs.timeToRespond = args.timeToRespond;
            this.context[args.auctionId].bidResponses.push(newargs);
          }
          break;

        case EVENTS.BID_REJECTED:
          logInfo('HOLID_BID_REJECTED:', args);
          if (this.context[args.auctionId]) {
            var newargs = {};
            newargs.bidder = args.bidder;
            newargs.adUnitCode = args.adUnitCode;
            newargs.mediaType = args.mediaType;
            newargs.rejectionReason = args.rejectionReason;
            this.context[args.auctionId].bidRejected.push(newargs);
          }
          break;

        case EVENTS.BIDDER_DONE:
          logInfo('HOLID_BIDDER_DONE:', args);
          if (this.context[args.auctionId]) {
            var newargs = {"bidderCode":args.bidderCode, "readyToSend":true};
            this.context[args.auctionId].bidderDone.push(newargs);
          }
          break;
        
        case EVENTS.BID_WON:
          logInfo('HOLID_BID_WON:', args);
          if (this.context[args.auctionId]) {
            var newargs = {};
            newargs.bidder = args.bidder;
            newargs.adUnitCode = args.adUnitCode;
            newargs.adId = args.adId;
            newargs.cpm = args.cpm;
            newargs.currency = args.currency;
            newargs.creativeId = args.creativeId;
            newargs.netRevenue = args.netRevenue;
            this.context[args.auctionId].winningBids.push(newargs);

            if (!this.context[args.auctionId].payloadSent) {
              holidAnalytics.sendAnalyticsEvents(newargs.auctionId);
            }
          }
          break;

        case EVENTS.AD_RENDER_FAILED:
          logInfo('HOLID_AD_RENDER_FAILED:', args);
          if (args?.bid?.auctionId && this.context[args.bid.auctionId]) {
            var newargs = {};
            newargs.adRenderFailed = true;
            newargs.adUnitCode = args.adUnitCode;
            newargs.reason = args.reason;
            newargs.message = args.message;
            this.context[args.bid.auctionId].adRenderFailed.push(newargs);

            if (!this.context[args.bid.auctionId].payloadSent) {
              holidAnalytics.sendAnalyticsEvents(args.bid.auctionId);
            }
          }
          break;

        case EVENTS.BID_TIMEOUT:
          logInfo('HOLID_BID_TIMEOUT:', args);
          (args || []).forEach(timeoutBid => {
            if (timeoutBid.auctionId && this.context[timeoutBid.auctionId]) {
              var newargs = {};
              newargs.bidder = timeoutBid.bidder;
              newargs.adUnitCode = timeoutBid.adUnitCode;
              newargs.adUnitId = timeoutBid.adUnitId;
              newargs.timeout = timeoutBid.timeout;
              this.context[timeoutBid.auctionId].bidTimeout.push(newargs);
            }
          });
          break;

        case EVENTS.AUCTION_END:
          logInfo('HOLID_AUCTION_END:', args);
          if (this.context[args.auctionId]) {
            if (!this.context[args.auctionId].payloadSent) {
              // Set a delay, as BID_WON events will come after AUCTION_END events
              setTimeout(() => holidAnalytics.sendAnalyticsEvents(args.auctionId), 1500);
            }
          }
          break;
      }
  }    
});

// save the base class function
holidAnalytics.originEnableAnalytics = holidAnalytics.enableAnalytics;

// override enableAnalytics so we can get access to the config passed in from the page
holidAnalytics.enableAnalytics = function (config) {
  holidAnalytics.originEnableAnalytics(config);
}

holidAnalytics.sendAnalyticsEvents = function(auctionId) {
  const auction = this.context[auctionId];
  if (!auction) return;
  if (this.context[auctionId].payloadSent) {
    logInfo(`Holid Analytics: payload already sent for auctionId = ${auctionId}`);
    return; // guard against duplicate sends
  }
  this.context[auctionId].payloadSent = true; // prevent double-send

  let gdprApplies = auction.bidRequests[0].gdprConsent ? auction.bidRequests[0].gdprConsent.gdprApplies : undefined;
  let gdprConsent = auction.bidRequests[0].gdprConsent ? auction.bidRequests[0].gdprConsent.consentString : undefined;

  if (gdprApplies === true && !gdprConsent) {
    logInfo('Holid Analytics: GDPR applies but no consent string found. Skipping analytics.');
    return;
  }

  const slots = window.googletag?.pubads?.()?.getSlots?.() || [];

  auction.bidRequests.forEach(bidRequest => {
    bidRequest.bids.forEach(bid => {
      slots.forEach(element => {
        if(element.getSlotElementId() == bid.adUnitCode) {
          const placementName = element.getAdUnitPath().split("/").pop();
          bid.placementName = placementName;
        }
      });
    });
  });
  
  const payload = {
    auctionId: auction.auctionId,
    startTime: auction.startTime,
    domain: auction.domain,
    bidRequests: auction.bidRequests,
    bidResponses: auction.bidResponses,
    bidRejected: auction.bidRejected,
    bidderDone: auction.bidderDone,
    bidTimeout: auction.bidTimeout,
    winningBids: auction.winningBids,
    adRenderFailed: auction.adRenderFailed,
    userAgent: navigator.userAgent,
    screen: {
      width: screen.width,
      height: screen.height
    }
  }
  
  ajax(ANALYTICS_URL + END_POINT, null, JSON.stringify(payload), {
    method: 'POST',
    contentType: 'application/json'
  });

  logInfo('Holid Analytics: sent payload', payload);
}

adapterManager.registerAnalyticsAdapter({
  adapter: holidAnalytics,
  code: 'holid'
});

holidAnalytics.enableAnalytics({}); // auto enable

export default holidAnalytics;