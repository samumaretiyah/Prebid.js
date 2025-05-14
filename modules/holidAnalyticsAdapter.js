import adapter from '../libraries/analyticsAdapter/AnalyticsAdapter.js';
import adapterManager from '../src/adapterManager.js';
import { ajax } from '../src/ajax.js';
import { logInfo } from '../src/utils.js';
import { EVENTS } from '../src/constants.js';

const ANALYTICS_URL = 'https://analytics.holid.io/prebid.php';

const holidAnalytics = Object.assign(adapter({url: ANALYTICS_URL, analyticsType: 'endpoint'}), {
  context: {},
  track({eventType, args}) {
    switch (eventType) {
      case EVENTS.AUCTION_INIT:
        this.context.auctionId = args.auctionId;
        this.context.startTime = args.timestamp;
        break;

      case EVENTS.BID_REQUESTED:
        this.context.bidRequests = this.context.bidRequests || [];
        this.context.bidRequests.push(args);
        break;

      case EVENTS.BID_RESPONSE:
        this.context.bidResponses = this.context.bidResponses || [];
        this.context.bidResponses.push(args);
        break;

      case EVENTS.BID_REJECTED:
        this.context.bidRejected = this.context.bidRejected || [];
        this.context.bidRejected.push(args);
        break;

      case EVENTS.BIDDER_DONE:
        this.context.bidderDone = this.context.bidderDone || [];
        this.context.bidderDone.push(args);
        break;
      
      case EVENTS.BID_WON:
        this.context.winningBid = args;
        break;

      case EVENTS.AUCTION_END:
        this.sendAnalytics();
        break;

      case EVENTS.BID_TIMEOUT:
        this.context.bidTimeout = args;
        break;
    }
  },
  
  sendAnalytics() {
    const payload = {
      auctionId: this.context.auctionId || null,
      startTime: this.context.startTime || null,
      bidRequests: this.context.bidRequests || [],
      bidResponses: this.context.bidResponses || [],
      bidRejected: this.context.bidRejected || [],
      bidderDone: this.context.bidderDone || [],
      winningBid: this.context.winningBid || null,
      bidTimeout: this.context.bidTimeout || [],
      userAgent: navigator.userAgent,
      screen: {
        width: screen.width,
        height: screen.height
      }
      // Optional: add more like viewability, IP hash (if collected), etc.
    };

    ajax(ANALYTICS_URL, null, JSON.stringify(payload), {
      method: 'POST', 
      contentType: 'application/json'
    });

    logInfo('Holid Analytics: sent payload', payload);
  }
});

adapterManager.registerAnalyticsAdapter({
  adapter: holidAnalytics,
  code: 'holid'
});

export default holidAnalytics;
