// src/models/organization.model.jsq

import mongoose from "mongoose";
import { v4 as uuidv4 } from "uuid";

const organizationSchema = new mongoose.Schema(
{
  orgId:{
    type:String,
    default:uuidv4,
    unique:true,
    immutable:true,
    index:true
  },
  orgName:{
    type:String,
    required:true,
    trim:true
  },
  orgEmail:{
    type:String,
    required:true,
    unique:true,
    lowercase:true,
    trim:true
  },
  website:{
    type:String,
    default:null
  },
  supportEmail:{
    type:String,
    lowercase:true,
    trim:true,
    default:null
  },
  postal:{
    type:String,
    default:null
  },
  onboardingType:{
    type:String,
    enum:["badgecert","non-badgecert"],
    default:"badgecert"
  },
  apiAuthKey:{
    type:String,
    default:"",
    select:false
  },
  primaryContact:{ type:[String], default:[] },
  admin1:        { type:[String], default:[] },
  admin2:        { type:[String], default:[] },
  admin3:        { type:[String], default:[] },
  reminderSettings:{
    enabled:   { type:Boolean, default:true },
    frequency: { type:String, enum:["daily","weekly"], default:"weekly" },
    weeklyDay: { type:Number, min:0, max:6, default:1 },
    time:      { type:String, default:"11:00" },
    timezone:  { type:String, default:"Asia/Kolkata" },
    lastRunAt: { type:Date, default:null }
  },
  addedByAdmin:{
    type:String,
    required:true,
    lowercase:true,
    trim:true,
    immutable:true
  },
  lastUpdatedBy:{ type:String, default:null, lowercase:true, trim:true },
  status:       { type:String, enum:["active","inactive"], default:"active" },
  isDeleted:    { type:Boolean, default:false }
},
{ timestamps:true }
);

export default mongoose.model("Organization", organizationSchema);
