# Our CHSI provider: the student status on the person's own report, shown (D215)

Unverified: no report was found in the open to try against, and the provider is registered from a real one.

## The page

- `https://www.chsi.com.cn/xlcx/bgcx.jsp`, "在线验证报告": one field, the 在线验证码 (the online verification code the
  person applied for; the report is valid for the period they chose, and they can extend it). The form posts to
  `/xlcx/bg.do?vcode=<code>&srcid=bgcx` (the page's own Vue code, read 24 Sep 2026).
- An invalid code answers "系统检测到非法访问，不合要求的在线验证码！" with no captcha. A report can be preceded by an image
  captcha (`/xlcx/yzm.do`) for a reader CHSI does not take for a browser (LenorEric/ChsiOnlineVerification, a public
  parser, handles it with a real browser). In the verification tab the person answers it themselves.
- The report (the same parser's fields): a photograph, 姓名, 性别, 出生日期, 民族, 证件号码, 院校, 层次, 院系, 班级, 专业,
  学号, 学制, 学历类别, 学习形式, 入学日期, 学籍状态. One is extracted: 学籍状态, "在籍（注册学籍）" for a student enrolled
  now.

## What is extracted

| field | what it is | unverified |
|---|---|---|
| `status` | 学籍状态, read by `readChsiStatus`: enrolled when it starts with 在籍 | the label's exact neighbourhood in the HTML, to anchor the regex on it |

## The definition to register (unverified)

```json
{
  "name": "CHSI, the student status (Viky)",
  "loginUrl": "https://www.chsi.com.cn/xlcx/bgcx.jsp",
  "verificationType": "WITNESS",
  "requestData": [
    {
      "url": "https://www.chsi.com.cn/xlcx/bg.do?vcode={{vcode}}&srcid=bgcx",
      "method": "POST",
      "responseMatches": [{ "type": "regex", "value": "学籍状态[\\s\\S]{0,120}?>(?<status>在籍[^<]{0,20}|[^<]{1,20})<" }],
      "responseRedactions": [{ "regex": "学籍状态[\\s\\S]{0,120}?>(?<status>在籍[^<]{0,20}|[^<]{1,20})<" }]
    }
  ]
}
```

## When the page does not carry it

A report without a status, or with another status, fails by its name (`NO_STATUS`, `NOT_ENROLLED`) before anything is
signed; the person is told nothing is lost; the journal carries the event.

## The terms, read 24 Sep 2026

CHSI's copyright statement (/about/copyright.shtml): "未经本网站同意，使用者不得将中国高等教育学生信息网所提供的任何内容与服务用于
其他用途，包含但不限于商业行为". Its pages on the report say third parties may check it free while it is valid. No clause
names robots. On the judges' page, the founder's call.
